const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let sessionId = 0;
let currentStep = 1;
let pendingPlan = null;
let isExecuting = false;
let evidence = [];
let history = [];

// --- Time & Uptime ---
function tick(){
  const now = new Date();
  $('#sysTime').textContent = now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  $('#welcomeTime').textContent = now.toLocaleTimeString();
}
tick(); setInterval(tick, 1000);

// Mock uptime ticker
let upSec = 4*86400+11*3600+22*60;
setInterval(()=>{ upSec++; const d=Math.floor(upSec/86400); const h=Math.floor((upSec%86400)/3600); const m=Math.floor((upSec%3600)/60); $('#uptime').textContent = `${d}d ${h}h ${m}m`; }, 1000);

// --- Views ---
$$('.nav-item').forEach(el=>{
  el.addEventListener('click',()=>{
    $$('.nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active'));
    $('#view-'+el.dataset.view).classList.add('active');
  });
});

// --- Services / Events mock ---
const services = [
  {name:'wuauserv', display:'Windows Update', state:'Stopped', start:'Disabled', note:'Auto (Delayed) expected'},
  {name:'BITS', display:'Background Intelligent Transfer', state:'Running', start:'Auto', note:'OK'},
  {name:'Audiosrv', display:'Windows Audio', state:'Running', start:'Auto', note:'OK'},
  {name:'WlanSvc', display:'WLAN AutoConfig', state:'Running', start:'Auto', note:'OK'},
  {name:'WinDefend', display:'Microsoft Defender Antivirus', state:'Running', start:'Auto', note:'OK'},
  {name:'SysMain', display:'SysMain (Superfetch)', state:'Running', start:'Auto', note:'High disk contributor'},
];
function renderServices(){
  $('#serviceList').innerHTML = services.map(s=>`
    <div class="svc">
      <span><b>${s.name}</b> · ${s.display}</span>
      <span class="evi-pill ${s.state==='Running'?'ok':s.state==='Stopped'?'bad':'warn'}">${s.state} · ${s.start}</span>
    </div>
  `).join('');
}
renderServices();

const events = [
  {time:'2026-10-22 06:41', lvl:'Error', src:'Service Control Manager', id:'7001', msg:'The Windows Update service failed to start due to error: Access is denied.'},
  {time:'2026-10-22 06:40', lvl:'Warning', src:'WindowsUpdateClient', id:'20', msg:'Installation Failure: Windows failed to install update 0x80070002'},
  {time:'2026-10-22 05:12', lvl:'Error', src:'Disk', id:'153', msg:'Disk 0 has been surprise removed. (NVMe timeout)'},
  {time:'2026-10-21 22:18', lvl:'Info', src:'Defender', id:'5007', msg:'Antivirus definitions updated successfully.'},
  {time:'2026-10-21 19:04', lvl:'Warning', src:'Kernel-PnP', id:'400', msg:'Driver \\Driver\\WudfRd failed to load for device USB\\VID_046D'},
];
function renderEvents(){
  $('#eventTable').innerHTML = `
    <div class="evt-row head"><span>Time</span><span>Level</span><span>Message</span><span>Source / ID</span></div>
    ${events.map(e=>`<div class="evt-row"><span>${e.time}</span><span class="evt-level ${e.lvl==='Error'?'error':e.lvl==='Warning'?'warning':'info'}">${e.lvl}</span><span>${e.msg}</span><span>${e.src} · ${e.id}</span></div>`).join('')}
  `;
}
renderEvents();

// --- Toast ---
function toast(msg){
  const t=$('#toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2700);
}

// --- Evidence rail ---
function pushEvidence(label, value){
  evidence.push({label, value});
  renderEvidence();
}
function renderEvidence(){
  if(!evidence.length){
    $('#evidenceList').innerHTML = `<div class="evidence-empty">No evidence yet. Start a diagnosis to gather system data.</div>`;
    return;
  }
  $('#evidenceList').innerHTML = evidence.map(e=>`
    <div class="evid-item"><b>${e.label}</b><span class="evi-pill ${e.value.includes('Fail')||e.value.includes('Stopped')||e.value.includes('Error')?'bad':e.value.includes('Running')||e.value.includes('OK')?'ok':'warn'}">${e.value}</span></div>
  `).join('');
}

// --- Steps ---
function setStep(n){
  currentStep = n;
  $$('.step').forEach(s=>{
    const sn=parseInt(s.dataset.step);
    s.classList.toggle('active', sn===n);
    s.classList.toggle('done', sn<n);
  });
  const labels = ['Diagnose','Plan','Authorize','Execute','Verify'];
  $('#modePill').textContent = (n<=2?'● DIAGNOSTIC':n===3?'● AUTHORIZATION REQUIRED':n===4?'● EXECUTING':'● VERIFYING');
  $('#modePill').className = 'mode-pill ' + (n>=3?'repair':'diagnostic');
  // rail phases
  $$('.phase').forEach((p,i)=>{
    p.classList.toggle('active', i===n-1);
  });
}

// --- Tool outputs simulation ---
const toolOutputs = {
  wuauserv: `PS C:\\Windows\\System32> Get-Service wuauserv | Format-List Name,Status,StartType

Name      : wuauserv
Status    : Stopped
StartType : Disabled

PS C:\\Windows\\System32> sc.exe qc wuauserv
[SC] QueryServiceConfig SUCCESS

        SERVICE_NAME: wuauserv
        TYPE               : 20  WIN32_SHARE_PROCESS
        START_TYPE         : 4   DISABLED
        ERROR_CONTROL      : 1   NORMAL
        BINARY_PATH_NAME   : C:\\Windows\\system32\\svchost.exe -k netsvcs -p
        LOAD_ORDER_GROUP   :
        TAG                : 0
        DISPLAY_NAME       : Windows Update
        DEPENDENCIES       : rpcss
        SERVICE_START_NAME : LocalSystem

PS C:\\Windows\\System32> Get-WinEvent -FilterHashtable @{LogName='System'; Id=7001} -MaxEvents 1 | Format-List Message
Message : The Windows Update service failed to start due to error: Access is denied.`,
  network: `PS C:\\Windows\\System32> ipconfig /all & netsh winsock show catalog & Get-DnsClient

Windows IP Configuration
   Host Name . . . : NEKO-PC
   DNS Servers . . . : 192.168.1.1 (Stale, no response)
   DHCP Enabled  . . : Yes

Winsock Catalog : OK (2 entries corrupted but not loaded)
Get-DnsClientServerAddress : 192.168.1.1 - Unreachable (Request timed out)
Nslookup google.com : *** Request to 192.168.1.1 timed out.`,
  audio: `PS C:\\Windows\\System32> Get-Service Audiosrv,AudiosrvPolicy,AudioEndpointBuilder

Status   Name               DisplayName
------   ----               -----------
Stopped  Audiosrv           Windows Audio
Stopped  AudioEndpointBuilder Windows Audio Endpoint Builder
Running  AudiosrvPolicy     (none)

PS C:\\Windows\\System32> Get-PnpDevice -Class Media -Status ERROR -ErrorAction SilentlyContinue
InstanceId: HDAUDIO\\FUNC_01&VEN_10EC&DEV_0892
 Problem: CM_PROB_FAILED_START (Code 10) - Device cannot start
 Driver: Realtek HD Audio 6.0.9235.1 - Signed, but service dependency missing`,
  performance: `PS C:\\Windows\\System32> Get-Counter "\\PhysicalDisk(_Total)\\% Disk Time"
CounterSamples : 98.7% Active Time (Avg 15min = 94%)
Process with highest I/O: CompatTelRunner.exe (12.4 MB/s), SearchIndexer.exe (8.1 MB/s)

PS C:\\Windows\\System32> Get-Service SysMain, WSearch
Status  StartType  Name
Running Automatic  SysMain
Running Automatic  WSearch

PS C:\\Windows\\System32> powercfg /sleepstudy | Select-Object -First 5
Last Sleep Transition: S0 Low Power Idle - Blocked by Realtek Audio Driver (10EC:0892)`,
  sfc: `Beginning system scan...
Windows Resource Protection found corrupt files but was unable to fix some of them.
Details are included in CBS.Log windir\\Logs\\CBS\\CBS.log

  Replaced: [SR] Cannot repair member file [l:13] "wuaueng.dll" of Microsoft-Windows-WindowsUpdateClient
  Source hash mismatch. Component store also corrupted.

Verification 100% complete.`,
  dism: `Deployment Image Servicing and Management tool
Version: 10.0.26100.1

Image Version: 10.0.26100.2605

[==========================100.0%==========================]
Error: 0x800f081f - The source files could not be found.
The component store corruption requires servicing stack fix before online repair.`,
  boot: `PS C:\\Windows\\System32> bcdedit /enum & powercfg /a & Get-WinEvent -LogName System -MaxEvents 3

Windows Boot Manager
identifier              {bootmgr}
device                  partition=\\Device\\HarddiskVolume1
path                    \\EFI\\Microsoft\\Boot\\bootmgfw.efi
description             Windows Boot Manager
BEFORE: timeout 30s

Windows Boot Loader
identifier              {current}
device                  partition=C:
path                    \\Windows\\system32\\winload.efi
recoveryenabled         Yes
bootstatuspolicy        IgnoreAllFailures  <-- suppresses boot diagnostics!

Available Sleep States: Standby (S3), Hibernate, Fast Startup (Hybrid Shutdown) = ON

Event 1001 BugCheck: 0x00000133 (DPC_WATCHDOG_VIOLATION) - ntoskrnl.exe + rtwlane6.sys (Realtek Wi-Fi)`,
};

function writeTerm(text, cls=''){
  const div=document.createElement('div');
  div.className='term-line '+cls;
  div.textContent=text;
  $('#terminal').appendChild(div);
  $('#terminal').scrollTop = $('#terminal').scrollHeight;
}

// Tools view terminal demo
$('#clearTerm').addEventListener('click',()=>{ $('#terminal').innerHTML=`<div class="term-line"><span class="ps">PS C:\\Windows\\System32></span> <span class="muted">Ready. Tools execute deterministically and log evidence.</span></div>`; });
$('#runDemoTool').addEventListener('click',()=>{
  writeTerm('PS C:\\Windows\\System32> Get-Service wuauserv | Format-Table Name,Status,StartType', 'term-cmd');
  setTimeout(()=> writeTerm(toolOutputs.wuauserv), 400);
});

// Tool cards click
$$('.tool-card').forEach(c=>{
  c.addEventListener('click',()=>{
    const t=c.dataset.tool;
    writeTerm(`PS C:\\Windows\\System32> Invoke-WinFixTool -Name ${t} -EvidenceMode`, 'term-cmd');
    let out = '';
    if(t==='sfc') out=toolOutputs.sfc;
    else if(t==='dism') out=toolOutputs.dism;
    else if(t==='chkdsk') out=`Stage 1: Examining basic file system structure ... 0 bad clusters. No errors in file record segment.`;
    else if(t==='registry') out=`⚠ Registry modification requires explicit authorization. Use the Diagnose flow to generate a structured repair plan. This tool will not execute without authorization.`;
    else if(t==='service') out=`⚠ Service configuration requires explicit authorization. Example: sc config wuauserv start= delayed-auto`;
    else if(t==='driver') out=`⚠ Driver operations require explicit authorization and reboot planning.`;
    else if(t==='bcd') out=`⚠ Boot configuration requires TrustedInstaller privilege. Current: Not Held. Will request elevation via repair service.`;
    else if(t==='network') out=toolOutputs.network;
    setTimeout(()=> writeTerm(out), 350);
    // switch to tools view if not already
    $$('.nav-item').forEach(n=>n.classList.remove('active')); $$('.nav-item[data-view="tools"]').classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-tools').classList.add('active');
    toast('Tool output logged as evidence');
  });
});

// --- Diagnosis Engine ---

function classifySymptom(text){
  const t=text.toLowerCase();
  if(t.includes('update')||t.includes('0x8007')||t.includes('wuauserv')||t.includes('0x800f08')) return 'update';
  if(t.includes('wi-fi')||t.includes('wifi')||t.includes('internet')||t.includes('dns')||t.includes('no browsing')||t.includes('network')) return 'network';
  if(t.includes('audio')||t.includes('sound')||t.includes('speaker')||t.includes('no sound')||t.includes('audiosrv')) return 'audio';
  if(t.includes('boot')||t.includes('slow')&&t.includes('startup')||t.includes('reboot')||t.includes('bcd')||t.includes('bootmgr')||t.includes('fast startup')) return 'boot';
  if(t.includes('slow')||t.includes('100% disk')||t.includes('high cpu')||t.includes('lag')||t.includes('performance')) return 'performance';
  if(t.includes('bsod')||t.includes('blue screen')||t.includes('bugcheck')||t.includes('dpc_watchdog')||t.includes('crash')||t.includes('0x00000133')) return 'bluescreen';
  return 'generic';
}

const diagnosisDB = {
  update:{
    title:'Windows Update cannot start — service disabled',
    symptom:'User reports Windows Update stuck / error 0x80070002 and service will not start.',
    rootCause:'The <b>Windows Update service (wuauserv)</b> startup type is set to <b>DISABLED</b>. This directly explains the failure: the Service Control Manager refuses to start a disabled service, so Update cannot fetch metadata and returns 0x80070002 (file not found in component store). Event ID 7001 confirms "Access is denied / service disabled".',
    evidence:[
      {label:'Service State', value:'DISABLED (Expected: Auto Delayed)'},
      {label:'Component Store', value:'Corrupt — wuaueng.dll hash mismatch'},
      {label:'Event Log', value:'7001: Failed to start wuauserv'},
      {label:'DISM Health', value:'RestoreHealth 0x800f081f — source needed'},
    ],
    toolOut: toolOutputs.wuauserv + "\n\n" + toolOutputs.sfc,
    plan:{
      problem:'Windows Update cannot start; updates fail with 0x80070002.',
      cause:'Windows Update service (wuauserv) is disabled. This directly prevents Update from starting (SCM error 7001). Secondary: component store corruption blocks repair.',
      target:'Service: wuauserv (Registry: HKLM\\SYSTEM\\CurrentControlSet\\Services\\wuauserv\\Start)',
      operation:'1) Set wuauserv Start=2 (Automatic Delayed) via sc config. 2) Start service via net start wuauserv. 3) Run sfc /scannow to repair wuaueng.dll. If DISM still fails, schedule online repair with source.',
      privilege:'Administrator (service config + start). No TrustedInstaller needed.',
      expected:'Service state: Running, StartType: Delayed-Auto. Windows Update can query and CBS.log shows [SR] repaired wuaueng.dll.',
      verification:'Query: sc query wuauserv + Get-Service wuauserv; re-run Windows Update check; confirm Event 7001 no longer recurs. Use "Repair verified" only if service is Running.',
      rollback:'Revert: sc config wuauserv start= disabled (if authorized). Export registry key before modification for restore.',
      dangerous:false
    }
  },
  network:{
    title:'No internet despite Wi-Fi connected — stale DNS + Winsock corruption',
    symptom:'Wi-Fi shows connected but browsing fails; DNS probe failed after recent update.',
    rootCause:'The update changed the DNS server cache and left <b>Winsock catalog entries corrupted</b>. The configured DNS server (192.168.1.1) is stale/unreachable, causing all name resolution to time out. The network stack is otherwise intact (adapter RUNNING, DHCP lease valid). This explains why link is up but browsing fails.',
    evidence:[
      {label:'Adapter State', value:'Connected — Wi-Fi RUNNING'},
      {label:'DNS Server', value:'Timed out — 192.168.1.1 stale'},
      {label:'Winsock', value:'Corrupted entries detected'},
      {label:'IPConfig', value:'DHCP lease valid · No gateway error'},
    ],
    toolOut: toolOutputs.network,
    plan:{
      problem:'No internet browsing despite Wi-Fi connected; DNS probe failed.',
      cause:'Winsock catalog corruption + stale DNS server entry from recent update. Name resolution times out.',
      target:'Network stack (Winsock, DNS cache, DHCP lease) — no registry/security policy change.',
      operation:'1) ipconfig /flushdns  2) netsh winsock reset  3) netsh int ip reset  4) ipconfig /release + /renew  5) Set DNS to automatic or 1.1.1.1 / 8.8.8.8 via netsh, then test with nslookup.',
      privilege:'Administrator (netsh/ipconfig).',
      expected:'Winsock catalog clean, DNS resolution succeeds (nslookup returns A records), browsing restored.',
      verification:'Run: nslookup example.com, ping 1.1.1.1, Get-DnsClientServerAddress. Success = DNS resolves and ping <30ms.',
      rollback:'No rollback needed; operations are non-destructive. Winsock reset is reversible via reboot if needed.',
      dangerous:false
    }
  },
  audio:{
    title:'No audio — Windows Audio service dependency failure (Code 10)',
    symptom:'Speaker icon red X, no playback devices.',
    rootCause:'The <b>Windows Audio Endpoint Builder</b> service failed to start because its dependency (AudioSrv) is stopped. This traces to the Realtek HD Audio driver reporting <b>Code 10 — device cannot start</b> due to missing service dependency. The driver is signed but cannot bind because the audio services are in STOPPED state.',
    evidence:[
      {label:'Audiosrv', value:'Stopped — Dependency failure'},
      {label:'Endpoint Builder', value:'Stopped'},
      {label:'Device Status', value:'Code 10 — HDAUDIO\\FUNC_01'},
      {label:'Driver', value:'Realtek 6.0.9235.1 — Signed'},
    ],
    toolOut: toolOutputs.audio,
    plan:{
      problem:'No audio output; system shows no playback device.',
      cause:'Windows Audio services stopped due to driver dependency failure (Code 10).',
      target:'Services: Audiosrv + AudioEndpointBuilder; Driver: Realtek HDAUDIO',
      operation:'1) sc config Audiosrv start= auto & sc config AudioEndpointBuilder start= auto  2) net start AudioEndpointBuilder, then Audiosrv (order matters). 3) If Code 10 persists: devcon restart or PnPUtil reinstall driver from Windows Update.',
      privilege:'Administrator (service start). Driver reinstall requires reboot planning.',
      expected:'Audiosrv + Endpoint Builder: Running. Device status: OK (Problem 0). Sound icon restored.',
      verification:'Get-Service Audiosrv, Get-PnpDevice -Status OK, test audio playback via Sound panel.',
      rollback:'Stop services if undesired; driver rollback via Device Manager → Previous driver.',
      dangerous:false
    }
  },
  boot:{
    title:'Slow boot & suppressed failure diagnostics — Fast Startup + bootstatuspolicy',
    symptom:'PC takes 4 minutes to boot; occasional boot errors hidden.',
    rootCause:'<b>Fast Startup (Hybrid Shutdown)</b> is ON combined with <b>bootstatuspolicy IgnoreAllFailures</b>, which suppresses automatic recovery diagnostics. This hides boot errors and forces a full cold-boot stall on driver timeout (Realtek Wi-Fi rtwlane6.sys). The BCD timeout is also misconfigured (30s). This directly explains slow boot — system waits for driver and never shows recovery options.',
    evidence:[
      {label:'Fast Startup', value:'Enabled — Hybrid Shutdown ON'},
      {label:'Boot Policy', value:'IgnoreAllFailures (suppressed)'},
      {label:'Boot Timeout', value:'30s (Expected: 0-3s with clean BCD)'},
      {label:'BugCheck History', value:'DPC_WATCHDOG in rtwlane6.sys'},
    ],
    toolOut: toolOutputs.boot,
    plan:{
      problem:'Slow boot (~4 min) and hidden boot failures.',
      cause:'Fast Startup + IgnoreAllFailures suppress diagnostics; Realtek Wi-Fi driver causes DPC watchdog delay.',
      target:'BCD: bootstatuspolicy + timeout; Power: Fast Startup; Driver: rtwlane6.sys',
      operation:'1) powercfg /hibernate off (disables Fast Startup) OR control panel toggle. 2) bcdedit /set {current} bootstatuspolicy DisplayAllFailures. 3) bcdedit /timeout 3. 4) Update rtwlane6.sys from vendor or disable device temporarily.',
      privilege:'Administrator (bcdedit requires elevation; Fast Startup toggle is Administrator). TrustedInstaller NOT required for this BCD set.',
      expected:'Boot timeout 3s, bootstatuspolicy DisplayAllFailures, cold boot ~18s, watchdog no longer recurs.',
      verification:'bcdedit /enum shows DisplayAllFailures + timeout 3; measure boot via Event Log 100-200 (Boot Performance) <20s.',
      rollback:'Re-enable: bcdedit /set bootstatuspolicy IgnoreAllFailures; powercfg /hibernate on. No destructive change.',
      dangerous:true
    }
  },
  performance:{
    title:'100% Disk usage — CompatTelRunner + SearchIndexer + SysMain',
    symptom:'System very slow, disk 100% in Task Manager, long startup.',
    rootCause:'<b>Microsoft Compatibility Telemetry (CompatTelRunner.exe)</b> is consuming sustained disk I/O during compatibility scan, compounded by <b>SysMain (Superfetch) prefetching</b> and <b>WSearch indexing</b> after an interrupted feature update. This directly explains 100% disk: three high-I/O services contend for the NVMe queue (94% avg active time). Not malware — defender scan clean.',
    evidence:[
      {label:'Disk Active Time', value:'98.7% — Critically high'},
      {label:'Top I/O Process', value:'CompatTelRunner.exe 12.4 MB/s'},
      {label:'SysMain', value:'Running — Prefetch active'},
      {label:'Defender Scan', value:'Clean — No malware'},
    ],
    toolOut: toolOutputs.performance,
    plan:{
      problem:'System slow with 100% disk usage, startup delayed.',
      cause:'CompatTelRunner + SysMain + WSearch contention after interrupted update; high disk queue, not storage failure.',
      target:'Services: SysMain, WSearch, Telemetry scheduling; Startup apps',
      operation:'1) Temporarily: net stop SysMain (test) — reduces prefetch. 2) Task Scheduler: disable Microsoft Compatibility Appraiser (or limit to idle). 3) Indexing Options: pause indexing or rebuild index overnight. 4) Task Manager → Startup: disable non-essential apps.',
      privilege:'Administrator (service stop + Task Scheduler).',
      expected:'Disk active time drops to <15% idle, boot + app launch normalized; indexing completes and idles.',
      verification:'PerfMon: \\PhysicalDisk\\% Disk Time <10% idle; Task Manager Disk column sorted; uptime after reboot shows <40s login.',
      rollback:'net start SysMain + re-enable scheduled task; no data loss.',
      dangerous:false
    }
  },
  bluescreen:{
    title:'BSOD DPC_WATCHDOG_VIOLATION — Realtek Wi-Fi driver rtwlane6.sys',
    symptom:'Repeated blue screen 0x133 pointing to ntoskrnl + rtwlane6.sys.',
    rootCause:'The <b>Realtek Wi-Fi driver (rtwlane6.sys)</b> is holding a DPC for longer than the watchdog timeout, causing <b>BugCheck 0x133 DPC_WATCHDOG_VIOLATION</b>. This is a driver bug, not RAM or storage failure (no Memory Diagnostics errors, SMART healthy). The call stack consistently ends in rtwlane6.sys per minidump analysis.',
    evidence:[
      {label:'BugCheck Code', value:'0x00000133 — DPC_WATCHDOG'},
      {label:'Faulting Module', value:'rtwlane6.sys + ntoskrnl.exe'},
      {label:'Memory Test', value:'OK — No hardware faults'},
      {label:'Storage SMART', value:'Healthy — NVMe temp 38°C'},
    ],
    toolOut: `Minidump analysis (WinDbg !analyze -v)
*******************************************************************************
* Bugcheck Analysis                                                           *
*******************************************************************************
DPC_WATCHDOG_VIOLATION (133)
Arguments: 0000000000000001 0000000000001e00 00000000fffff801
IMAGE_NAME:  rtwlane6.sys
FAILURE_BUCKET_ID: 0x133_ISR_rtwlane6!unknown_function
STACK: ntoskrnl!KeAccumulateTicks → rtwlane6!MpHandleInterrupt

Windows Defender: No malware
Chkdsk: No filesystem errors
SFC: No integrity violations`,
    plan:{
      problem:'Repeated BSOD 0x133 DPC_WATCHDOG_VIOLATION.',
      cause:'Realtek Wi-Fi driver rtwlane6.sys DPC timeout — driver bug, not hardware.',
      target:'Driver: rtwlane6.sys (Realtek Wi-Fi) + power management',
      operation:'1) Device Manager → Network adapters → Realtek Wi-Fi → Update driver from Windows Update or vendor (Nov 2024+). 2) If no newer: Rollback to 2023 stable or disable device and use Ethernet/USB Wi-Fi. 3) Power Management → Uncheck "Allow computer to turn off this device".',
      privilege:'Administrator (driver install). Reboot required.',
      expected:'BSOD ceases; minidump no longer generated; Wi-Fi stable under load (iperf test).',
      verification:'No new BugCheck in Event Viewer (7 days), verifier /query shows no violations, stress test network for 10min.',
      rollback:'Device Manager → Roll Back Driver; or PnPUtil reinstall previous .inf. Create restore point before.',
      dangerous:true
    }
  },
  generic:{
    title:'General diagnostic — evidence insufficient for single root cause',
    symptom:'General report without specific error codes.',
    rootCause:'Insufficient evidence to isolate one primary root cause. Common patterns suggest checking <b>system file integrity, service health, and recent changes</b> before proposing any modification.',
    evidence:[
      {label:'User Report', value:'Vague — needs tool data'},
      {label:'Suggested Check', value:'SFC + Service states'},
      {label:'Event Log', value:'Review System + Application'},
      {label:'Next Action', value:'Run diagnostic tools'},
    ],
    toolOut:`PS C:\\Windows\\System32> sfc /verifyonly
Windows Resource Protection did not find any integrity violations (quick check).

PS C:\\Windows\\System32> Get-Service | Where Status -eq Stopped | Select -First 5
wuauserv, WaaSMedicSvc, Spooler (if no printer), DiagTrack

Recommendation: Provide an error code, screenshot, or "When did it start?" to narrow root cause.`,
    plan:{
      problem:'Reported issue without specific error code or failing component.',
      cause:'Insufficient evidence — cannot attribute to registry/drivers/updates without data.',
      target:'None yet — gather evidence only.',
      operation:'No repair executed. Next: Run sfc /verifyonly (non-destructive), check Event Viewer for Errors in last 24h, and re-describe symptom with error code if possible.',
      privilege:'Administrator (read-only tooling). No modification.',
      expected:'Diagnostic data collected; user provides precise symptom for targeted plan.',
      verification:'Re-inspect tool output; confirm new symptom details.',
      rollback:'Not applicable — no modification.',
      dangerous:false
    }
  }
};

// --- Chat ---
const chat = $('#chatContainer');
const input = $('#userInput');
const sendBtn = $('#sendBtn');

function addMessage(role, html){
  const msg=document.createElement('div');
  msg.className='msg '+role;
  const avatar = role==='ai'?'◈':'You';
  const name = role==='ai'?`WinFix AI <span class="msg-tag">Local · Evidence-based</span>`:`You`;
  const time = new Date().toLocaleTimeString();
  msg.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-body">
      <div class="msg-name">${name} <span class="msg-time">${time}</span></div>
      <div class="msg-bubble">${html}</div>
    </div>
  `;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
  return msg;
}

function addDiagnosisCard(diagKey){
  const d = diagnosisDB[diagKey];
  sessionId++;
  const sid = sessionId;
  const card=document.createElement('div');
  card.className='diag-card';
  card.id=`diag-${sid}`;
  card.innerHTML = `
    <div class="diag-card-head">
      <b>🔍 Diagnostic Session #${sid} — ${d.title}</b>
      <span class="diag-badge analyzing">Evidence gathering…</span>
    </div>
    <div class="evidence-grid">
      ${d.evidence.map(e=>`<div class="evid-box"><h4>${e.label}</h4><div class="evid-row"><span>Status</span><b class="evi-pill ${e.value.includes('Fail')||e.value.includes('Stopped')||e.value.includes('Timed')||e.value.includes('Corrupt')||e.value.includes('Watchdog')||e.value.includes('suppressed')||e.value.includes('Code 10')||e.value.includes('Critically')||e.value.includes('DISABLED')?'bad':e.value.includes('Connected')||e.value.includes('OK')||e.value.includes('Healthy')||e.value.includes('Running')?'ok':'warn'}">${e.value}</b></div></div>`).join('')}
    </div>
    <div class="terminal-mini">
      <div class="term-mini-head"><span>Tool Output — Deterministic</span><span style="font-family:var(--mono);font-size:11px;color:#8a8a8a">Administrator</span></div>
      <div class="term-mini-body">${escapeHtml(d.toolOut)}</div>
    </div>
    <div class="root-cause">
      <h4>▸ Root Cause — <span style="color:#6b4a00">One primary cause (evidence-backed)</span></h4>
      <p>${d.rootCause}</p>
      <p style="margin-top:8px;color:#6b4a00;font-size:12px">This is not a speculative list. Every statement maps to tool output above. If evidence is insufficient, I will say so.</p>
    </div>
    <div class="repair-plan-preview">
      <span style="font-size:12.5px;color:var(--muted)"><b style="color:#1a1a1a">Repair Plan Ready →</b> Minimal modification + explicit verification. No Defender/UAC disable, no random registry edits.</span>
      <button class="btn primary" onclick="openPlan('${diagKey}')">View & Authorize Plan</button>
    </div>
  `;
  chat.appendChild(card);
  chat.scrollTop = chat.scrollHeight;

  // push evidence to rail
  d.evidence.forEach(e=> pushEvidence(e.label, e.value));
  setStep(2);

  // update badge after a tick
  setTimeout(()=>{
    card.querySelector('.diag-badge').textContent='Plan Ready — Awaiting Authorization';
    card.querySelector('.diag-badge').className='diag-badge plan';
  }, 900);
}

function escapeHtml(s){
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

// Send handler
function handleSend(){
  const text = input.value.trim();
  if(!text || isExecuting) return;
  addMessage('user', `<p>${escapeHtml(text)}</p>`);
  input.value=''; autoResize();
  // typing indicator
  const typing=document.createElement('div');
  typing.className='msg ai'; typing.id='typing';
  typing.innerHTML=`<div class="msg-avatar">◈</div><div class="msg-body"><div class="msg-name">WinFix AI <span class="msg-tag">Analyzing…</span></div><div class="msg-bubble"><p>Inspecting evidence… querying services, event logs, and system state. <span style="color:var(--muted)">Preferring evidence over assumptions.</span></p></div></div>`;
  chat.appendChild(typing); chat.scrollTop=chat.scrollHeight;

  setTimeout(()=>{
    typing.remove();
    const key = classifySymptom(text);
    const d = diagnosisDB[key];
    addMessage('ai', `
      <p><b>Problem</b><br>${escapeHtml(d.symptom)}</p>
      <p><b>What is wrong</b><br>I ran deterministic checks (service query, event log inspection). The primary failure is: <b>${escapeHtml(d.title)}</b>. See the evidence card below — every claim maps to a tool output.</p>
      <p style="font-size:12px;color:var(--muted)">Next: Review the Root Cause, then open the structured repair plan. Dangerous operations (registry, drivers, BCD) will require your explicit authorization and are logged for rollback.</p>
    `);
    addDiagnosisCard(key);
  }, 750);
}

function autoResize(){
  input.style.height='auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

sendBtn.addEventListener('click', handleSend);
input.addEventListener('keydown', e=>{
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); }
});
input.addEventListener('input', autoResize);

// Suggestions
$$('.sugg').forEach(b=>{
  b.addEventListener('click',()=>{ input.value=b.dataset.fill; input.focus(); autoResize(); });
});
$$('.quick-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    const map={
      update:'Windows Update fails with error 0x80070002, wuauserv won\'t start',
      network:'No internet — Wi-Fi shows connected but DNS probe failed after update',
      audio:'No sound — speaker icon has red X, audio service not running, Code 10 in Device Manager',
      boot:'PC takes 4 minutes to boot, Fast Startup is on, boot errors are hidden',
      performance:'Computer very slow, 100% disk usage by CompatTelRunner and SearchIndexer',
      bluescreen:'BSOD DPC_WATCHDOG_VIOLATION 0x133 in rtwlane6.sys, repeats on Wi-Fi load'
    };
    input.value = map[b.dataset.symptom] || '';
    // switch to diagnose view
    $$('.nav-item').forEach(n=>n.classList.remove('active')); $$('.nav-item[data-view="diagnose"]').classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-diagnose').classList.add('active');
    handleSend();
  });
});

// --- Plan Modal ---
window.openPlan = function(key){
  const d = diagnosisDB[key];
  pendingPlan = {key, diag:d, id: sessionId};
  const p = d.plan;
  $('#planBody').innerHTML = `
    <div style="background:linear-gradient(135deg,#f0f6ff,#ffffff);border:1px solid #c7daf0;border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:11px;letter-spacing:.6px;font-weight:700;color:#003a5d">DIAGNOSE → PLAN → AUTHORIZE → EXECUTE → VERIFY</div>
      <div style="font-size:13px;margin-top:6px;line-height:1.6">This plan proposes <b>minimal modification</b> tied to the diagnosed root cause. No random registry/driver changes. Every operation has an expected state and verification method.</div>
    </div>
    <table class="plan-table">
      <tr><th>Problem</th><td>${escapeHtml(p.problem)}</td></tr>
      <tr><th>Root Cause</th><td>${p.cause}</td></tr>
      <tr><th>Target</th><td><code style="background:#f3f3f3;padding:2px 6px;border-radius:4px;font-family:var(--mono)">${escapeHtml(p.target)}</code></td></tr>
      <tr><th>Operation</th><td>${escapeHtml(p.operation).replaceAll('\n','<br>')}</td></tr>
      <tr><th>Required Privilege</th><td>${p.privilege} ${p.dangerous?'<span style="background:var(--danger-bg);color:var(--danger);padding:2px 6px;border-radius:999px;font-size:11px;font-weight:700;margin-left:6px">⚠ Dangerous — Explicit Auth</span>':''}</td></tr>
      <tr><th>Expected Result</th><td>${escapeHtml(p.expected)}</td></tr>
      <tr><th>Verification</th><td>${escapeHtml(p.verification)}</td></tr>
      <tr><th>Rollback</th><td>${escapeHtml(p.rollback)}</td></tr>
    </table>
    ${p.dangerous?`<div class="plan-note"><b>TrustedInstaller / Security Note:</b> Operations touching boot configuration, drivers, or registry hives require explicit authorization. I will not disable Defender, UAC, or Firewall to fix an unrelated issue. A restore point / registry export is suggested before execution.</div>`:''}
    <div class="plan-note" style="background:#f9f9f9;border-color:var(--border)"><b>Verification rule:</b> Exit code 0 is not success. I will re-query the component (e.g., <code>sc query wuauserv</code>) and compare actual vs expected state before reporting "Repair verified."</div>
  `;
  $('#planModal').classList.add('open');
  setStep(3);
};

$('#closeModal').addEventListener('click', ()=> $('#planModal').classList.remove('open'));
$('#dismissPlan').addEventListener('click', ()=> $('#planModal').classList.remove('open'));
$('#planModal').addEventListener('click', e=>{ if(e.target===$('#planModal')) $('#planModal').classList.remove('open'); });
$('#denyPlan').addEventListener('click', ()=>{
  $('#planModal').classList.remove('open');
  toast('Authorization denied — no modification performed');
  addMessage('ai', `<p><b>Authorization denied</b> — as requested, no system modification was performed. The system remains in its prior state. You can re-open the plan or describe a new symptom.</p>
  <p style="font-size:12px;color:var(--muted)">Principle: Never perform a repair without explicit authorization for sensitive operations.</p>`);
  setStep(1);
});

$('#authorizePlan').addEventListener('click', ()=>{
  if(!pendingPlan || isExecuting) return;
  $('#planModal').classList.remove('open');
  executePlan(pendingPlan);
});

function executePlan(planCtx){
  isExecuting = true;
  setStep(4);
  const plan = planCtx.diag.plan;
  const card = $(`#diag-${planCtx.id}`);
  if(card){
    const badge = card.querySelector('.diag-badge');
    if(badge){ badge.textContent='Executing…'; badge.className='diag-badge analyzing'; }
  }

  // Show execution message
  const execMsg=document.createElement('div');
  execMsg.className='msg ai';
  execMsg.innerHTML=`
    <div class="msg-avatar">◈</div>
    <div class="msg-body">
      <div class="msg-name">WinFix AI <span class="msg-tag">Executing · ${escapeHtml(plan.privilege)}</span></div>
      <div class="msg-bubble" id="execBubble">
        <p><b>Authorization confirmed.</b> Executing authorized operations only. Logging every meaningful modification.</p>
        <div class="terminal-mini" style="margin:10px 0 0">
          <div class="term-mini-head"><span>Execution Log</span><span id="execStatus" style="color:#60CDFF">Running…</span></div>
          <div class="term-mini-body" id="execLog" style="color:#d4d4d4;background:#1e1e1e">PS C:\\Windows\\System32> # WinFix repair session ${planCtx.id}\n</div>
        </div>
      </div>
    </div>
  `;
  chat.appendChild(execMsg); chat.scrollTop=chat.scrollHeight;

  const logEl = execMsg.querySelector('#execLog');
  const statusEl = execMsg.querySelector('#execStatus');
  const steps = getExecSteps(planCtx.key);
  let idx=0;

  // Privilege indicator TrustedInstaller fake for dangerous
  if(plan.dangerous){
    $('#tiStatus').textContent='TrustedInstaller: Requesting elevation…';
    $('#tiStatus').className='ti-on';
  }

  function next(){
    if(idx >= steps.length){
      statusEl.textContent='Verifying…'; statusEl.style.color='#FFCC00';
      logEl.textContent += `\n> Verifying expected state...`;
      // Verification phase
      setTimeout(()=>{
        const ver = getVerification(planCtx.key);
        logEl.textContent += `\n${ver.log}`;
        statusEl.textContent='Repair verified ✓'; statusEl.style.color='#4EC9B0';
        // Update badge
        if(card){
          const badge2 = card.querySelector('.diag-badge');
          if(badge2){ badge2.textContent='Repair verified ✓'; badge2.style.background='var(--success-bg)'; badge2.style.color='var(--success)'; badge2.style.border='1px solid #b7dfb7'; }
        }
        addMessage('ai', `
          <p><b style="color:var(--success)">Repair verified.</b> — Expected state confirmed.</p>
          <p><b>Problem</b>: ${escapeHtml(plan.problem)}</p>
          <p><b>Root Cause</b>: ${plan.cause}</p>
          <p><b>Fix</b>: ${escapeHtml(plan.operation)}</p>
          <p><b>Verification</b>: ${ver.summary}</p>
          <p style="font-size:12px;color:var(--muted)">Verification method: ${escapeHtml(plan.verification)} — actual state matches expected. If the symptom persists, please report what still fails.</p>
        `);
        // Add to history
        history.unshift({
          id: planCtx.id,
          title: planCtx.diag.title,
          when: new Date().toLocaleString(),
          problem: plan.problem,
          cause: plan.cause,
          operation: plan.operation,
          verification: ver.summary,
          privilege: plan.privilege,
          verified: true
        });
        renderHistory();
        if(plan.dangerous){
          $('#tiStatus').textContent='TrustedInstaller: Released';
          setTimeout(()=>{ $('#tiStatus').textContent='TrustedInstaller: Not Held'; $('#tiStatus').className='ti-off'; }, 2500);
        }
        setStep(5);
        isExecuting = false;
      }, 900);
      return;
    }
    const s=steps[idx];
    logEl.textContent += `\nPS> ${s.cmd}\n${s.out}`;
    chat.scrollTop = chat.scrollHeight;
    // also write to main terminal
    writeTerm(`PS C:\\Windows\\System32> ${s.cmd}`, 'term-cmd');
    writeTerm(s.out, s.cls||'');
    idx++;
    setTimeout(next, 700 + Math.random()*400);
  }
  setTimeout(next, 600);
}

function getExecSteps(key){
  if(key==='update') return [
    {cmd:'sc.exe config wuauserv start= delayed-auto', out:'[SC] ChangeServiceConfig SUCCESS — StartType changed: DISABLED → DELAYED_AUTO', cls:'term-ok'},
    {cmd:'sc.exe qc wuauserv | findstr START_TYPE', out:'START_TYPE         : 2   AUTO_START (DELAYED)', cls:'term-ok'},
    {cmd:'net start wuauserv', out:'The Windows Update service is starting.\nThe Windows Update service was started successfully.', cls:'term-ok'},
    {cmd:'sc.exe query wuauserv', out:'SERVICE_NAME: wuauserv\n        TYPE               : 20  WIN32_SHARE_PROCESS\n        STATE              : 4  RUNNING\n        WIN32_EXIT_CODE    : 0  (0x0)', cls:'term-ok'},
    {cmd:'sfc /scannow (verify repair)', out:'Verification 100% complete.\nWindows Resource Protection found corrupt files and successfully repaired them.\nDetails in CBS.log — wuaueng.dll restored from store.', cls:'term-ok'},
  ];
  if(key==='network') return [
    {cmd:'ipconfig /flushdns', out:'Successfully flushed the DNS Resolver Cache.', cls:'term-ok'},
    {cmd:'netsh winsock reset', out:'Successfully reset the Winsock Catalog.\nYou must restart the computer to complete the reset.', cls:'term-ok'},
    {cmd:'netsh int ip reset', out:'Resetting Interface, OK!\nResetting Neighbor, OK! — restart required', cls:'term-ok'},
    {cmd:'netsh interface ip set dns "Wi-Fi" static 1.1.1.1', out:'DNS server set to 1.1.1.1 — Validated', cls:'term-ok'},
    {cmd:'nslookup example.com', out:'Server:  one.one.one.one\nAddress:  1.1.1.1\nName:    example.com\nAddress:  93.184.216.34 — Resolved ✓', cls:'term-ok'},
    {cmd:'ping 1.1.1.1 -n 1', out:'Reply from 1.1.1.1: bytes=32 time=12ms TTL=58 — Success', cls:'term-ok'},
  ];
  if(key==='audio') return [
    {cmd:'sc.exe config Audiosrv start= auto', out:'[SC] ChangeServiceConfig SUCCESS', cls:'term-ok'},
    {cmd:'sc.exe config AudioEndpointBuilder start= auto', out:'[SC] ChangeServiceConfig SUCCESS', cls:'term-ok'},
    {cmd:'net start AudioEndpointBuilder', out:'The Windows Audio Endpoint Builder service is starting.\nThe Windows Audio Endpoint Builder service was started successfully.', cls:'term-ok'},
    {cmd:'net start Audiosrv', out:'The Windows Audio service is starting.\nThe Windows Audio service was started successfully.', cls:'term-ok'},
    {cmd:'Get-PnpDevice -InstanceId HDAUDIO\\FUNC_01* | Get-PnpDeviceProperty', out:'Device Status: OK\nProblem Code: 0 — Device is working properly.\nDriver: Realtek 6.0.9235.1 — Started', cls:'term-ok'},
  ];
  if(key==='boot') return [
    {cmd:'powercfg /hibernate off', out:'Hibernation-file removed. Fast Startup (Hybrid Shutdown) disabled.', cls:'term-ok'},
    {cmd:'bcdedit /set {current} bootstatuspolicy DisplayAllFailures', out:'The operation completed successfully. — bootstatuspolicy = DisplayAllFailures', cls:'term-ok'},
    {cmd:'bcdedit /set {bootmgr} timeout 3', out:'The operation completed successfully. — timeout 3s', cls:'term-ok'},
    {cmd:'Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Services\\rwlane6 -Name Start', out:'Start : 3  (Manual — will update driver; temporarily disabled auto-start)', cls:'term-warn'},
    {cmd:'bcdedit /enum {current} | findstr bootstatuspolicy', out:'bootstatuspolicy        DisplayAllFailures — Verified', cls:'term-ok'},
  ];
  if(key==='performance') return [
    {cmd:'net stop SysMain', out:'The SysMain service is stopping.\nThe SysMain service was stopped successfully. — Disk active time 98.7% → 18.3%', cls:'term-ok'},
    {cmd:'schtasks /Change /TN "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser" /DISABLE', out:'SUCCESS: The scheduled task was disabled. — Will run only on idle, not continuously', cls:'term-ok'},
    {cmd:'net stop WSearch && timeout 3 && net start WSearch /reindex', out:'Windows Search stopped / index rebuild scheduled overnight (02:00). Current I/O throttled.', cls:'term-ok'},
    {cmd:'Get-Counter "\\PhysicalDisk(_Total)\\% Disk Time" -SampleInterval 2 -MaxSamples 1', out:'CounterSamples: 9.4% Active Time — Normalized ✓', cls:'term-ok'},
  ];
  if(key==='bluescreen') return [
    {cmd:'Checkpoint-Computer -Description "Pre-driver-update restore point"', out:'Restore point created: Pre-driver-update (ID 42) — System Protection', cls:'term-ok'},
    {cmd:'pnputil /add-driver .\\rtwlane6_2024.inf /install', out:'Driver package added successfully.\nPublished name: oem42.inf\nDriver installed: Realtek Wi-Fi 6001.15.123.2024 (WHQL)', cls:'term-ok'},
    {cmd:'powercfg /devicequery wake_armed', out:'Realtek Wi-Fi adapter — Power management: corrected (allow wake, no aggressive power save)', cls:'term-ok'},
    {cmd:'verifier /query', out:'No violations. Driver verifier: rtwlane6.sys — clean run 10min', cls:'term-ok'},
  ];
  return [
    {cmd:'echo "No repair — evidence gathering only"', out:'No system modification performed. Collecting additional data.', cls:''}
  ];
}

function getVerification(key){
  const maps={
    update:{log:'sc query wuauserv: STATE RUNNING ✓\nGet-WindowsUpdateLog: No new 0x80070002 errors\nEvent Viewer: Last 24h has 0 new Service Control 7001 for wuauserv', summary:'Service Running + Update check succeeds. No new 7001 errors in 24h.'},
    network:{log:'nslookup example.com: 93.184.216.34 ✓\nping 1.1.1.1: 12ms ✓\nGet-NetAdapter: Wi-Fi Up, DNS 1.1.1.1 reachable', summary:'DNS resolves and ping succeeds; browsing restored.'},
    audio:{log:'Get-Service Audiosrv: Running ✓\nGet-PnpDevice Media: Status OK ✓\nSound test: playback device enumerated', summary:'Audio services Running; device status OK; playback enumerated.'},
    boot:{log:'bcdedit /enum: bootstatuspolicy DisplayAllFailures, timeout 3s ✓\nEvent Log Boot Performance: 18.2s (was 243s) ✓', summary:'Boot policy corrected, Fast Startup off, boot time 18s (was 4min).'},
    performance:{log:'\\PhysicalDisk\\% Disk Time: 9.4% idle ✓\nTask Manager: Highest I/O SearchIndexer 2.1 MB/s (throttled) ✓', summary:'Disk active time <10% idle; I/O contention resolved.'},
    bluescreen:{log:'Event Viewer: No BugCheck 0x133 in last stress test (30min) ✓\nMinidump folder: no new .dmp ✓', summary:'No new BSOD after driver update; stability verified.'},
    generic:{log:'No modification to verify. Provide more symptom details.', summary:'Evidence window remains open; awaiting precise symptom.'}
  };
  return maps[key]||maps.generic;
}

function renderHistory(){
  if(!history.length) return;
  $('#historyList').innerHTML = history.map(h=>`
    <div class="history-item">
      <div class="history-head">
        <span class="history-title">${escapeHtml(h.title)}</span>
        <span class="verified yes">Repair verified ✓</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${h.when} · Session #${h.id} · ${escapeHtml(h.privilege)}</div>
      <div class="history-grid">
        <div class="hist-box"><b>PROBLEM</b>${escapeHtml(h.problem)}</div>
        <div class="hist-box"><b>ROOT CAUSE</b>${h.cause}</div>
        <div class="hist-box"><b>OPERATION</b>${escapeHtml(h.operation)}</div>
        <div class="hist-box"><b>VERIFICATION</b>${escapeHtml(h.verification)}</div>
      </div>
    </div>
  `).join('');
}

// Reset
$('#resetBtn').addEventListener('click', ()=>{
  evidence=[]; renderEvidence();
  pendingPlan=null; isExecuting=false;
  setStep(1);
  $('#tiStatus').textContent='TrustedInstaller: Not Held'; $('#tiStatus').className='ti-off';
  chat.innerHTML = `
    <div class="msg ai">
      <div class="msg-avatar">◈</div>
      <div class="msg-body">
        <div class="msg-name">WinFix AI <span class="msg-tag">Local · Administrator</span> <span class="msg-time">${new Date().toLocaleTimeString()}</span></div>
        <div class="msg-bubble">
          <p><b>Session reset.</b> System state preserved — no modifications were reverted except where explicitly rolled back. Ready for a new diagnosis.</p>
          <p class="hint">Tip: Use Quick Diagnostics in the left sidebar or describe the symptom below.</p>
        </div>
        <div class="msg-suggestions">
          <button class="sugg" data-fill="Windows Update fails with error 0x80070002, wuauserv won't start">Windows Update 0x80070002</button>
          <button class="sugg" data-fill="No internet — Wi-Fi shows connected but no browsing, DNS probe failed">No internet after update</button>
          <button class="sugg" data-fill="Computer is very slow, Task Manager shows 100% disk usage, startup takes long">100% disk / slow PC</button>
          <button class="sugg" data-fill="No sound — speaker icon has red X, audio service not running">No audio output</button>
        </div>
      </div>
    </div>
  `;
  $$('.msg-suggestions .sugg').forEach(b=> b.addEventListener('click',()=>{ input.value=b.dataset.fill; input.focus(); autoResize(); }));
  toast('Session reset — evidence cleared');
});

$('#newDiagBtn').addEventListener('click', ()=>{ input.focus(); toast('Describe the symptom in the input bar'); });


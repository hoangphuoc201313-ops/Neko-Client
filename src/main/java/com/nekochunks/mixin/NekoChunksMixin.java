package com.nekochunks.mixin;

import net.minecraft.server.MinecraftServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MinecraftServer.class)
public class NekoChunksMixin {
	@Inject(at = @At("HEAD"), method = "loadLevel")
	private void init(CallbackInfo info) {
		// Placeholder từ fabric-example-mod. Mixin thật cho mục tiêu tối ưu chunk sẽ thêm ở Bước 5.
	}
}

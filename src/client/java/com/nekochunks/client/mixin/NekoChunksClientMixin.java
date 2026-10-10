package com.nekochunks.client.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Minecraft.class)
public class NekoChunksClientMixin {
	@Inject(at = @At("HEAD"), method = "run")
	private void init(CallbackInfo info) {
		// Placeholder từ fabric-example-mod. Mixin thật cho mục tiêu tối ưu chunk sẽ thêm ở Bước 5.
	}
}

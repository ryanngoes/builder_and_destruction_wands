import { ModalFormData } from "@minecraft/server-ui";
import { apiConfigInfo } from "../lib/player/config";
import { apiWandInfo } from "../lib/wand";
import { world } from "@minecraft/server";
world.afterEvents.itemUse.subscribe(({ source: player, itemStack: item }) => {
    if (apiWandInfo.testValidWand(item)) {
        if (player.getBlockFromViewDirection({ maxDistance: 10 }))
            return;
        const config = apiConfigInfo.getWandConfig(player, item);
        new ModalFormData()
            .title("ui.builder_wand:config.wand.title")
            .slider({ translate: "ui.builder_wand:config.wand.slider" }, 3, apiWandInfo.getMaxSize(item), 2, config.size)
            .toggle("ui.builder_wand:config.wand.toggle", config.connect)
            .show(player).then(r => {
            if (r.canceled)
                return;
            config.size = r.formValues[0];
            config.connect = r.formValues[1];
            apiConfigInfo.setWandConfig(player, item, config);
        });
    }
});

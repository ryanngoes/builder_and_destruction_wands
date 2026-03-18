import { wandSize } from "../variables";
export const apiConfigInfo = new class apiConfigInfo {
    getWandConfig(player, item) {
        const dynamic = player.getDynamicProperty(`builder_wand:config_${item.typeId.replace("builder_wand:", "").replace("builder_", "")}`);
        if (dynamic)
            return JSON.parse(dynamic);
        return this.setWandConfig(player, item, defaultWandInfo(wandSize[item.typeId]));
    }
    setWandConfig(player, item, config) {
        player.setDynamicProperty(`builder_wand:config_${item.typeId.replace("builder_wand:", "").replace("builder_", "")}`, JSON.stringify(config));
        return config;
    }
};
function defaultWandInfo(max = 3) {
    return {
        size: max,
        connect: false
    };
}

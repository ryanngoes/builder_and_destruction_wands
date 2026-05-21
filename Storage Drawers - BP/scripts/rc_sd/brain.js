import * as mc from "@minecraft/server";

import * as astra from "./astra/events.js";

// Importar eventos aqui, para evitar ocorrencia de vários eventos iguais em um addon apenas:
mc.system.beforeEvents.startup.subscribe(data => {
    astra.startupEvent(data);
})

mc.world.afterEvents.entityHitBlock.subscribe(data => {
    astra.entityHitBlockEvent(data);
})

mc.world.beforeEvents.playerBreakBlock.subscribe(data => {
    astra.playerBreakBlockEvent(data);
})

mc.system.runInterval(() => {
    astra.runIntervalEvent();
});
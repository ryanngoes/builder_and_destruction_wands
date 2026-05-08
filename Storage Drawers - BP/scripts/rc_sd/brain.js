import * as mc from "@minecraft/server";

import * as astra from "./astra/events.js";

// Importar eventos aqui, para evitar ocorrencia de vários eventos iguais em um addon apenas:
mc.system.beforeEvents.startup.subscribe(data => {
    astra.startupEvent(data);
})
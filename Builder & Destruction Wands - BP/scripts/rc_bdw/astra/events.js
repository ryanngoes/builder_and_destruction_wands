import * as mc from "@minecraft/server";

//Builder & Destruction Wands
import { builderWandComponent } from "./bdw/builderWand";

/**
 * 
 * @param {mc.StartupEvent} data 
 */
export function startupEvent(data) {
    builderWandComponent(data);
}
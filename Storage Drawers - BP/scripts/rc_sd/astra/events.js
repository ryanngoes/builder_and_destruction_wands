import * as mc from "@minecraft/server";

//Storage Drawers
import { storageDrawerComponent } from "./rc_sd/components/storageDrawer";

export function startupEvent(data) {
    storageDrawerComponent(data);
}
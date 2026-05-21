import * as mc from "@minecraft/server";
import { Vector } from "./rc_sd/astraAPI";
import FaceSelectionPlains from "./rc_sd/components/faceSelection";
import SelectionBoxes from "./rc_sd/components/boxSelection";

//Storage Drawers
import { storageDrawerComponent } from "./rc_sd/components/storageDrawer";
import { compactDrawerComponent } from "./rc_sd/components/compactDrawer";
import { drawerControllerComponent } from "./rc_sd/components/drawerController";
import { pipeComponent } from "./rc_sd/components/pipe";

import { beforeDrawerBreakComponent, afterHitComponent } from "./rc_sd/components/storageDrawer";

export function startupEvent(data) {
    storageDrawerComponent(data);
    compactDrawerComponent(data);
    drawerControllerComponent(data);
    pipeComponent(data);
}

export function playerBreakBlockEvent(data) {
    beforeDrawerBreakComponent(data);
}

export function entityHitBlockEvent(data) {
    afterHitComponent(data);
}

const isFrontFace = (block, face) =>
    block.permutation.getState("minecraft:cardinal_direction") === face.toLowerCase();


const pipeParts = new SelectionBoxes(
    //center
    { origin: [-4, 4, -4], size: [8, 8, 8] },

    //north
    { origin: [-4, 4, -8], size: [8, 8, 4] },

    //south
    { origin: [-4, 4, 4], size: [8, 8, 4] },

    //east
    { origin: [-8, 4, -4], size: [4, 8, 8] },

    //west
    { origin: [4, 4, -4], size: [4, 8, 8] },

    //above
    { origin: [-4, 12, -4], size: [8, 4, 8] },

    //below
    { origin: [-4, 0, -4], size: [8, 4, 8] },
)

export function runIntervalEvent() {
    for (const player of mc.world.getAllPlayers()) {
        const playerHead = player.getHeadLocation();
        const viewDirection = player.getViewDirection();

        const forwardOffset = 0.2; // distância a frente da cabeça

        const startLocation = {
            x: playerHead.x + viewDirection.x * forwardOffset,
            y: playerHead.y + viewDirection.y * forwardOffset + 0.1,
            z: playerHead.z + viewDirection.z * forwardOffset
        };

        const blockTestDistance = player.dimension.getBlockFromRay(
            startLocation,
            viewDirection,
            { maxDistance: 10, includePassableBlocks: true }
        );

        const absoluteDistance = blockTestDistance ? Math.floor(Vector.distance(startLocation, blockTestDistance.block.center()) + 1.15) : 0;

        const distance = absoluteDistance <= 5 ? absoluteDistance : 0

        const blockInView = player.dimension.getBlockFromRay(
            startLocation,
            viewDirection,
            { maxDistance: distance * 2, includePassableBlocks: true }
        );

        if (!blockInView) continue

        const block = blockInView.block

        if (block.typeId === "rc_sd:pipe") {
            const selectedPot = pipeParts.getSelected(blockInView.faceLocation);
            //console.warn("selected part", selectedPot);
        }

        //console.warn("block in view", block.typeId, "distance", distance);

        const config = block.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params;
        const type = config?.type; // "1x1", "1x2", "2x2", "ender"

        const slotConfigs = {
            "1x1": [
                { origin: [2, 2], size: [12, 12] }
            ],
            "1x2": [
                { origin: [2, 2], size: [12, 5] },
                { origin: [2, 9], size: [12, 5] }
            ],
            "2x2": [
                { origin: [2, 2], size: [5, 5] },
                { origin: [9, 2], size: [5, 5] },
                { origin: [2, 9], size: [5, 5] },
                { origin: [9, 9], size: [5, 5] }
            ],
        };


        const slotAreas = slotConfigs[type];

        if (!slotAreas) return;

        const slot = new FaceSelectionPlains(...slotAreas).getSelected(blockInView);

        const isFront = isFrontFace(block, blockInView.face);
        const hasSlot = !Number.isNaN(Number(slot));

        if ((isFront && !hasSlot) || !isFront) {
            // não está olhando para o (s) slot (s)
            //console.warn("warn: olhando para a frente, mas fora dos slots");


            const [entity] = block.dimension?.getEntities({
                type: 'rc_sd:drawer_inventory',
                location: block.center(),
                maxDistance: 0.5,
            });

            if (entity) {
                if (!player.isSneaking) {
                    entity.triggerEvent('rc_sd:remove_collision');
                    player.setPropertyOverrideForEntity(entity, 'rc_sd:selection', false)
                } else {
                    entity.removeTag('rc_sd:validation')
                    entity.triggerEvent('rc_sd:set_block_collision');
                    player.setPropertyOverrideForEntity(entity, 'rc_sd:selection', true)
                }

            }
        }
    }
}
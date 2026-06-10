import * as mc from "@minecraft/server";
import { Vector } from "./rc_sd/astraAPI";
import FaceSelectionPlains from "./rc_sd/components/faceSelection";
import SelectionBoxes from "./rc_sd/components/boxSelection";

//Storage Drawers
import { storageDrawerComponent } from "./rc_sd/components/storageDrawer";
import { compactDrawerComponent } from "./rc_sd/components/compactDrawer";
import { drawerControllerComponent } from "./rc_sd/components/drawerController";
import { pipeComponent, connectBlock, disconnectBlock, isContainer, map } from "./rc_sd/components/pipe";
import { wrenchComponent } from "./rc_sd/components/wrench";

import { beforeDrawerBreakComponent, afterHitComponent } from "./rc_sd/components/storageDrawer";

export function startupEvent(data) {
    storageDrawerComponent(data);
    compactDrawerComponent(data);
    drawerControllerComponent(data);
    pipeComponent(data);
    wrenchComponent(data);
}

export function playerBreakBlockEvent(data) {
    beforeDrawerBreakComponent(data);
}

export function entityHitBlockEvent(data) {
    afterHitComponent(data);
}

export function playerBreakBlockAfterEvent(data) {
    const { brokenBlockPermutation, block } = data

    const itemsIds = Object.keys(map);
    const itemsIdsSet = new Set(itemsIds);

    function isContainerPerId(typeId) {
        if (!typeId) return false;

        return itemsIdsSet.has(typeId)
        
    }

    if (isContainerPerId(brokenBlockPermutation.type.id)) {
        disconnectBlock(block, false)
    }
}

export function playerPlaceBlockAfterEvent(data) {
    const { block } = data
    if (isContainer(block)) {
        disconnectBlock(block, false)
    }
}

const isFrontFace = (block, face) =>
    block.permutation.getState("minecraft:cardinal_direction") === face.toLowerCase();

export function runIntervalEvent() {
    for (const player of mc.world.getAllPlayers()) {

        const equipment = player.getComponent("equippable");
        const itemStack = equipment.getEquipment("Mainhand");

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
                if (player.isSneaking) {
                    entity.triggerEvent('rc_sd:remove_collision');
                    player.setPropertyOverrideForEntity(entity, 'rc_sd:selection', false)
                } else if (!player.isSneaking && itemStack?.typeId !== "rc_sd:wrench") {
                    entity.removeTag('rc_sd:validation')
                    entity.triggerEvent('rc_sd:set_block_collision');
                    player.setPropertyOverrideForEntity(entity, 'rc_sd:selection', true)
                }
            }
        }
    }
}
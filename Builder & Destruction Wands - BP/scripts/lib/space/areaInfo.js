import { apiConfigInfo } from "../player/config";
import { validBlocks } from "./validBlocks";
export const apiAreaInfo = new class apiAreaInfo {
    constructor() {
        this.offsetDirection = { "North": ["z", -1], "South": ["z", 1], "East": ["x", 1], "West": ["x", -1], "Up": ["y", 1], "Down": ["y", -1] };
        this.AreaDirection = { "North": ["x", "y"], "South": ["x", "y"], "East": ["z", "y"], "West": ["z", "y"], "Up": ["x", "z"], "Down": ["x", "z"] };
    }
    getBlocksToPlace(player, block, direction, item) {
        const config = apiConfigInfo.getWandConfig(player, item);
        const size = config.size;
        const area = this.getAreaPos(block.location, direction, size);
        return validBlocks.getAll(player, area, block, direction);
    }
    getAreaPos(center, direction, size) {
        return this.applyDirection(center, direction, Math.floor(size / 2));
    }
    applyOffset(oldPos, direction) {
        const offset = this.offsetDirection[direction];
        const pos = { ...oldPos };
        pos[offset[0]] += offset[1];
        return pos;
    }
    applyDirection(oldPos, direction, radius) {
        const pos = { ...oldPos };
        const offset = this.AreaDirection[direction];
        pos[offset[0]] += -1 * radius;
        pos[offset[1]] += -1 * radius;
        const min = { ...pos };
        pos[offset[0]] += 2 * radius;
        pos[offset[1]] += 2 * radius;
        return { min: min, max: pos };
    }
};

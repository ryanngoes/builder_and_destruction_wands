const dir = { "North": "z", "South": "z", "East": "x", "West": "x", "Up": "y", "Down": "y" };
const dirNum = { "North": -1, "South": 1, "East": 1, "West": -1, "Up": 1, "Down": -1 };
export const apiNumbers = new class apiNumbers {
    clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
    distance(pos1, pos2) { return Math.sqrt(((pos1.x - pos2.x) ** 2) + ((pos1.y - pos2.y) ** 2) + ((pos1.z - pos2.z) ** 2)); }
    centerVector(pos) { return { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 }; }
    vectorToString(pos) { return `${pos.x}, ${pos.y}, ${pos.z}`; }
    vectorAdd(pos, direction) {
        const newVec = { ...pos };
        newVec[dir[direction]] += dirNum[direction];
        return newVec;
    }
};

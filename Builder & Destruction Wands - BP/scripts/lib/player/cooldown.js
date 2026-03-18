export const apiCooldown = new class apiCooldown {
    getTime() {
        return (new Date().getTime()) / 1000;
    }
    getTimeOut(player, id) {
        const cooldownEnd = player.getDynamicProperty(id);
        if (typeof cooldownEnd != "number")
            return this.getTime() - 1;
        return cooldownEnd;
    }
    setCooldown(player, id, amount) {
        const timeOut = this.getTime() + amount;
        player.setDynamicProperty(id, timeOut);
        return timeOut;
    }
    testTimeOut(player, id) { return this.getTime() < this.getTimeOut(player, id); }
};

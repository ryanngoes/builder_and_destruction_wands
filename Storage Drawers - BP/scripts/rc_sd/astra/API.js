import * as mc from "@minecraft/server";

export function getItemType(block, item) {
  if (!item?.typeId) return 'item';

  if (item.typeId === 'minecraft:bedrock') {
    return 'block';
  }

  if (item.typeId === 'minecraft:end_portal_frame' || item?.typeId.includes('block')) {
    return 'block';
  }

  const nonBlockItems = new Set([
    "minecraft:lantern",
    "minecraft:soul_lantern",
    "minecraft:deadbush",
    "minecraft:sniffer_egg",
    "minecraft:lever",
    "minecraft:flower_pot",
    "minecraft:frog_spawn",
    "minecraft:web",
    "minecraft:nether_wart",
    "minecraft:dandelion",
    "minecraft:peony",
    "minecraft:blue_orchid",
    "minecraft:cornflower",
    "minecraft:sunflower",
    "minecraft:torchflower",
    "minecraft:dandelion",
    "minecraft:poppy",
    "minecraft:azure_bluet",
    "minecraft:lily_of_the_valley",
    "minecraft:allium",
    "minecraft:lilac",
    "minecraft:pitcher_plant",
    "minecraft:oxeye_daisy",
    "minecraft:open_eyeblossom",
    "minecraft:closed_eyeblossom",
    "minecraft:bush",
    "minecraft:mangrove_propagule",
    "minecraft:crimson_fungus",
    "minecraft:warped_fungus",
    "minecraft:leaf_litter",
    "minecraft:glow_lichen",
    "minecraft:seagrass",
    "minecraft:nether_sprouts",
    "minecraft:hanging_roots"
  ]);

  // Removi "frame" do array para não capturar end_portal_frame
  const nonBlockPatterns = [
    "kelp", "coral", "vine", "glowstone_dust", "hopper", "chain", "resin_clump",
    "candle", "campfire", "cauldron", "armor_stand", "sign", "item_frame", // Mantém "item_frame" específico
    "painting", "mushroom", "bell", "rail", "torch", "amethyst_cluster",
    "blud", "_door", "ladder", "iron_bars", "bed", "sea_pickle", "brewing_stand",
    "tripwire_hook", "poppy", "sapling", "_grass", "fern", "tulip", "rose", "bush"
  ];

  // Verificação para casos específicos de "frame" que não são blocos
  if (item.typeId === "minecraft:item_frame" || item.typeId === "minecraft:glow_item_frame") {
    return 'item';
  }

  if (nonBlockItems.has(item.typeId) || nonBlockPatterns.some(pattern => item.typeId.includes(pattern))) {
    return 'item';
  }

  const weaponItems = [
    'mace',
    'sword',
    'pickaxe',
    'axe',
    'shovel',
    'hoe',
    'breeze_rod',
    'blaze_rod',
    'fishing_rod',
    'carrot_on_a_stick',
    'warped_fungus_on_a_stick',
    'stick',
  ];

  if (weaponItems.some(type => item?.typeId.includes(type)) || item?.typeId === "minecraft:bamboo") {
    return 'weapon'
  }

  if (item?.typeId.includes('_wall')) {
    return 'wall'
  }

  if (item?.typeId === "minecraft:chest" || item?.typeId === "minecraft:trapped_chest" || item?.typeId === "minecraft:ender_chest" || item?.typeId === "rc_sd:storage_controller" || item?.typeId.includes('_drawer_')) {
    return 'invert'
  }

  if (item?.typeId.includes('fence') || item?.typeId === "minecraft:anvil") {
    return 'fence'
  }

  if (item?.typeId === "minecraft:pointed_dripstone") {
    return 'dripstone'
  }

  if (item?.typeId === "minecraft:heavy_core") {
    return 'heavy'
  }

  if (item?.typeId === "minecraft:end_rod" || item?.typeId === "minecraft:lightning_rod") {
    return 'rod'
  }

  if (item?.typeId === "minecraft:beacon" || item?.typeId === "minecraft:dragon_egg") {
    return 'beacon'
  }

  if (item?.typeId === "minecraft:decorated_pot") {
    return 'misc'
  }

  if (item?.typeId.includes('_amethyst_bud')) {
    return 'small'
  }

  const fakeItems = new Set([
    "minecraft:banner",
    "minecraft:bow",
    "minecraft:crossbow",
    "minecraft:shield",
    "minecraft:spyglass",
    "minecraft:trident"
  ]);

  if (fakeItems.has(item.typeId)) {
    return 'fake';
  }

  try {
    if (block.dimension.runCommand(`setblock ${block.x} -64 ${block.z} ${item.typeId}`).successCount > 0) {
      block.dimension.runCommand(`setblock ${block.x} -64 ${block.z} bedrock`);
      return 'block';
    }
  } catch (error) { }

  return 'item';
}

export function typeToNumber(type) {
  switch (type) {
    case 'item':
      return 0;
    case 'block':
      return 1;
    case 'weapon':
      return 2;
    case 'misc':
      return 3;
    case 'small':
      return 4;
    case 'beacon':
      return 5;
    case 'fence':
      return 6;
    case 'invert':
      return 7;
    case 'heavy':
      return 8;
    case 'wall':
      return 9;
    case 'rod':
      return 10;
    case 'dripstone':
      return 11;
    case 'fake':
      return 12;
    default:
      return 0;
  }
}

export function clearMainhand(player, count) {
  if (player.getGameMode() == 'creative') return
  let selectedSlot = player.getComponent("equippable").getEquipment("Mainhand")
  if (selectedSlot.amount > count) {
    selectedSlot.amount = selectedSlot.amount - count;
    player.getComponent("equippable").setEquipment("Mainhand", selectedSlot);
  } else {
    let air = new mc.ItemStack("minecraft:air");
    player.getComponent("equippable").setEquipment("Mainhand", air);
  }
}

export function setPermutation(block, stateAdd, stateValue) {
  const result = block.permutation.getAllStates();
  if (!Object.keys(result).includes(stateAdd)) return;
  result[stateAdd] = stateValue;
  block.setPermutation(mc.BlockPermutation.resolve(block?.typeId, result));
}

export function directionToAngle(direction) {
  if (direction === "north") return 0;
  if (direction === "south") return 180;
  if (direction === "west") return -90;
  if (direction === "east") return 90;
}

export function sneakingPull(slot, quantity, player, entity, block, item) {
  if (quantity >= 64) {
    addItemtoInventory(64, player, item);
    entity.setDynamicProperty(`rc_sd:quantity_${slot}`, quantity - 64);
    if (block.typeId === 'rc_sd:ender_drawer') {
      const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
      const frequencyData = getFrequencyData(frequency);
      setFrequency(frequency, quantity - 64, frequencyData.ajust_item, loadInv(frequencyData.item))
    }
  } else {
    addItemtoInventory(quantity, player, item);
    entity.setDynamicProperty(`rc_sd:quantity_${slot}`, 0);
    quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;
    if (block.typeId === 'rc_sd:ender_drawer') {
      const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
      const frequencyData = getFrequencyData(frequency);
      setFrequency(frequency, 0, frequencyData.ajust_item, loadInv(frequencyData.item))
    }
  }
  quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;

  resetStorage(slot, quantity, entity, block)
}

export function normalPull(slot, quantity, player, entity, block, item) {
  addItemtoInventory(1, player, item);
  entity.setDynamicProperty(`rc_sd:quantity_${slot}`, quantity - 1);
  quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;

  if (block.typeId === 'rc_sd:ender_drawer') {
    const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
    const frequencyData = getFrequencyData(frequency);
    setFrequency(frequency, quantity, frequencyData.ajust_item, loadInv(frequencyData.item))
  }
}

export function addItemtoInventory(amount, player, item) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return;

  let added = 0;

  for (let i = 0; i < amount; i++) {
    const single = item.clone();
    single.amount = 1;

    const leftover = container.addItem(single);

    if (leftover !== undefined) player.dimension.spawnItem(single, player.location);
    else added++;
  }
}

export function resetStorage(slot, quantity, entity, block) {
  if ((block.typeId === "rc_sd:ender_drawer" || block.permutation.getState("rc_sd:lock") === false) && quantity < 1) {
    entity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 rc_sd:air`);
    entity.runCommand(`replaceitem entity @s slot.inventory 0 rc_sd:air`);
    const config = block.getComponent("rc_sd:storage_config").customComponentParameters.params;
    const type = config.type; // "1x1", "1x2", "2x2", "ender"
    const inventorySlot = getInventorySlot(type, slot);
    const entityInventory = block.dimension.getEntities({
      location: block.center(),
      type: `rc_sd:storage_inventory`,
      maxDistance: 0.5
    })[0];
    setItemSlot("rc_sd:air", inventorySlot, entityInventory);



    if (block.typeId === 'rc_sd:ender_drawer') {
      const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
      const frequencyData = getFrequencyData(frequency);
      setFrequency(frequency, 0, 0, loadInv(new mc.ItemStack("rc_sd:air")))
    }
  }
}

export function compareItems(a, b) {

  if (!a || !b) return false;
  // typeId
  if ((a.typeId || "") !== (b.typeId || "")) return false;

  // nameTAg
  if ((a.nameTag || "") !== (b.nameTag || "")) return false;

  // Lore
  const loreA = a.getLore() || [];
  const loreB = b.getLore() || [];
  if (loreA.length !== loreB.length) return false;
  for (let i = 0; i < loreA.length; i++) {
    if (loreA[i] !== loreB[i]) return false;
  }

  // Tags
  const tagsA = (a.getTags() || []).sort();
  const tagsB = (b.getTags() || []).sort();
  if (tagsA.length !== tagsB.length) return false;
  for (let i = 0; i < tagsA.length; i++) {
    if (tagsA[i] !== tagsB[i]) return false;
  }

  // Durabilidade
  const durA = a.getComponent("durability")?.damage || 0;
  const durB = b.getComponent("durability")?.damage || 0;
  if (durA !== durB) return false;

  // Encantamentos — usa getEnchantments() com fallback seguro
  const enchCompA = a.getComponent("enchantable");
  const enchCompB = b.getComponent("enchantable");
  const enchA = enchCompA ? enchCompA.getEnchantments() || [] : [];
  const enchB = enchCompB ? enchCompB.getEnchantments() || [] : [];

  if (enchA.length !== enchB.length) return false;
  for (let i = 0; i < enchA.length; i++) {
    if (
      enchA[i].type.id !== enchB[i].type.id ||
      enchA[i].level !== enchB[i].level
    ) return false;
  }

  // Propriedades dinâmicas
  const dynIdsA = (a.getDynamicPropertyIds() || []).sort();
  const dynIdsB = (b.getDynamicPropertyIds() || []).sort();
  if (dynIdsA.length !== dynIdsB.length) return false;
  for (const id of dynIdsA) {
    if (a.getDynamicProperty(id) !== b.getDynamicProperty(id)) return false;
  }

  return true;
}


export const listUpgrade = {
  "rc_sd:copper_upgrade": 8,
  "rc_sd:gold_upgrade": 16,
  "rc_sd:diamond_upgrade": 24,
  "rc_sd:netherite_upgrade": 32
}

export const utilityUpgrade = [
  "rc_sd:void_upgrade"
]

export function getStorageLimit(block, amount_per_slot, entity, inventory) {
  let amountPerSlot = amount_per_slot

  for (let x = 0; x < inventory.size; x++) {
    const item = inventory.getItem(x)

    if (!item) continue

    if (listUpgrade[item?.typeId]) amountPerSlot += amountPerSlot * listUpgrade[item?.typeId]
    else if (item?.typeId == `rc_sd:iron_downgrade`) amountPerSlot = 64

    if (item?.typeId == `rc_sd:void_utility`) setPermutation(block, 'rc_sd:void_upgrade', true)
    else setPermutation(block, 'rc_sd:void_upgrade', false)

  }
  return amountPerSlot
}

const lastClickTimes = new Map();
export function doubleClick(player) {
  const currentTime = Date.now();
  const playerId = player.name;

  if (lastClickTimes.has(playerId) && currentTime - lastClickTimes.get(playerId) < 400) {
    player.addTag("doubleClick");
  } else {
    player.removeTag("doubleClick");
  }

  lastClickTimes.set(playerId, currentTime);
}

export function playerActionBar(limit, player, entity, entityInventory, slot) {
  const quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;

  if (quantity < limit) {
    // Mostra o armazenamento atual e o limite
    player.onScreenDisplay.setActionBar(`${quantity}/${limit}`)
  } else {
    // Indica que o armazenamento precisa de um upgrade

    player.onScreenDisplay.setActionBar({
      translate: "need_upgrade.text",
      with: [
        `${quantity}`, //quantidade atual
        `${limit}` //limite total
      ]
    });


  }
}

export function updateItem(player, item) {
  const inv = player.getComponent('inventory').container
  inv.setItem(player.selectedSlotIndex, item)
}

export function updateItemOffHand(player, item) {
  player.getComponent("equippable").setEquipment("Offhand", item);
}

export function applyDurability(player, item, amount) {
  if (player.getGameMode() == 'creative') return item
  if (item && amount) {
    const durability = item.getComponent('minecraft:durability')
    if (durability && durability.damage + amount >= durability.maxDurability) {
      player.dimension.playSound('random.break', player.location)
      return undefined
    } else if (durability && durability.damage + amount < durability.maxDurability) {
      item.getComponent('minecraft:durability').damage = item.getComponent('minecraft:durability').damage + amount
      return item
    } else if (!durability) return item
  }
}

export function isWalking(player) {
  const velocity = player.getVelocity();
  const absoluteSpeed = Math.abs(velocity.x) + Math.abs(velocity.z);
  if (absoluteSpeed > 0.05) return true
  else return false
}

export function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function setItemSlot(itemTypeId, slot, entity) {
  const item = new mc.ItemStack(itemTypeId);
  entity.getComponent("inventory").container.setItem(slot, item)
}

export function getInventorySlot(type, visualSlot) {
  const mapping = {
    "ender": [1],
    "1x1": [1],
    "1x2": [2, 3],
    "2x2": [4, 5, 6, 7]
  };

  return mapping[type]?.[visualSlot];
}

export const validSlots = {
  "ender": [1],
  "1x1": [1],
  "1x2": [2, 3],
  "2x2": [4, 5, 6, 7]
}

export function directionToNum(direction) {
  if (direction === "up" || direction === "above") return 1;
  if (direction === "down" || direction === "below") return 0;
  if (direction === "north") return 2;
  if (direction === "south") return 3;
  if (direction === "west") return 4;
  if (direction === "east") return 5;
}

export function invertFace(face) {
  if (face == 'above') return 'below'
  if (face == 'below') return 'above'
  if (face == 'north') return 'south'
  if (face == 'south') return 'north'
  if (face == 'west') return 'east'
  if (face == 'east') return 'west'
}

export const itemsList = [
  "minecraft:oak_stairs",
  "minecraft:mangrove_stairs",
  "minecraft:dark_oak_stairs",
  "minecraft:acacia_stairs",
  "minecraft:birch_stairs",
  "minecraft:jungle_stairs",
  "minecraft:spruce_stairs",
  "minecraft:warped_stairs",
  "minecraft:crimson_stairs",
  "minecraft:cherry_stairs",
  "minecraft:bamboo_stairs",
  "minecraft:bamboo_mosaic_stairs",
  "minecraft:stone_stairs",
  "minecraft:mossy_cobblestone_stairs",
  "minecraft:normal_stone_stairs",
  "minecraft:stone_brick_stairs",
  "minecraft:mossy_stone_brick_stairs",
  "minecraft:granite_stairs",
  "minecraft:polished_granite_stairs",
  "minecraft:andesite_stairs",
  "minecraft:polished_andesite_stairs",
  "minecraft:diorite_stairs",
  "minecraft:polished_diorite_stairs",
  "minecraft:sandstone_stairs",
  "minecraft:smooth_sandstone_stairs",
  "minecraft:red_sandstone_stairs",
  "minecraft:smooth_red_sandstone_stairs",
  "minecraft:quartz_stairs",
  "minecraft:smooth_quartz_stairs",
  "minecraft:cut_copper_stairs",
  "minecraft:exposed_cut_copper_stairs",
  "minecraft:weathered_cut_copper_stairs",
  "minecraft:oxidized_cut_copper_stairs",
  "minecraft:waxed_cut_copper_stairs",
  "minecraft:waxed_exposed_cut_copper_stairs",
  "minecraft:waxed_weathered_cut_copper_stairs",
  "minecraft:waxed_oxidized_cut_copper_stairs",
  "minecraft:polished_blackstone_stairs",
  "minecraft:polished_blackstone_brick_stairs",
  "minecraft:blackstone_stairs",
  "minecraft:prismarine_stairs",
  "minecraft:dark_prismarine_stairs",
  "minecraft:prismarine_bricks_stairs",
  "minecraft:brick_stairs",
  "minecraft:red_nether_brick_stairs",
  "minecraft:nether_brick_stairs",
  "minecraft:end_brick_stairs",
  "minecraft:purpur_stairs",
  "minecraft:cobbled_deepslate_stairs",
  "minecraft:polished_deepslate_stairs",
  "minecraft:deepslate_tile_stairs",
  "minecraft:deepslate_brick_stairs",
  "minecraft:mud_brick_stairs",
  "minecraft:oak_slab",
  "minecraft:mangrove_slab",
  "minecraft:dark_oak_slab",
  "minecraft:acacia_slab",
  "minecraft:birch_slab",
  "minecraft:jungle_slab",
  "minecraft:spruce_slab",
  "minecraft:warped_slab",
  "minecraft:crimson_slab",
  "minecraft:cherry_slab",
  "minecraft:bamboo_slab",
  "minecraft:bamboo_mosaic_slab",
  "minecraft:stone_slab",
  "minecraft:mossy_cobblestone_slab",
  "minecraft:stone_slab",
  "minecraft:cobblestone_brick_slab",
  "minecraft:stone_block_slab4",
  "minecraft:granite_slab",
  "minecraft:polished_granite_slab",
  "minecraft:andesite_slab",
  "minecraft:polished_andesite_slab",
  "minecraft:diorite_slab",
  "minecraft:polished_diorite_slab",
  "minecraft:sandstone_slab",
  "minecraft:smooth_sandstone_slab",
  "minecraft:stone_block_slab2",
  "minecraft:stone_block_slab",
  "minecraft:smooth_red_sandstone_slab",
  "minecraft:quartz_slab",
  "minecraft:smooth_quartz_slab",
  "minecraft:cut_copper_slab",
  "minecraft:exposed_cut_copper_slab",
  "minecraft:weathered_cut_copper_slab",
  "minecraft:oxidized_cut_copper_slab",
  "minecraft:waxed_cut_copper_slab",
  "minecraft:waxed_exposed_cut_copper_slab",
  "minecraft:waxed_weathered_cut_copper_slab",
  "minecraft:waxed_oxidized_cut_copper_slab",
  "minecraft:polished_blackstone_slab",
  "minecraft:polished_blackstone_brick_slab",
  "minecraft:blackstone_slab",
  "minecraft:prismarine_slab",
  "minecraft:dark_prismarine_slab",
  "minecraft:prismarine_bricks_slab",
  "minecraft:brick_slab",
  "minecraft:red_nether_brick_slab",
  "minecraft:nether_brick_slab",
  "minecraft:stone_block_slab3",
  "minecraft:purpur_slab",
  "minecraft:cobbled_deepslate_slab",
  "minecraft:polished_deepslate_slab",
  "minecraft:deepslate_tile_slab",
  "minecraft:deepslate_brick_slab",
  "minecraft:mud_brick_slab",
  "minecraft:oak_sign",
  "minecraft:mangrove_sign",
  "minecraft:dark_oak_sign",
  "minecraft:acacia_sign",
  "minecraft:birch_sign",
  "minecraft:jungle_sign",
  "minecraft:spruce_sign",
  "minecraft:warped_sign",
  "minecraft:crimson_sign",
  "minecraft:cherry_sign",
  "minecraft:bamboo_sign",
  "minecraft:oak_hanging_sign",
  "minecraft:mangrove_hanging_sign",
  "minecraft:dark_oak_hanging_sign",
  "minecraft:acacia_hanging_sign",
  "minecraft:birch_hanging_sign",
  "minecraft:jungle_hanging_sign",
  "minecraft:spruce_hanging_sign",
  "minecraft:warped_hanging_sign",
  "minecraft:crimson_hanging_sign",
  "minecraft:cherry_hanging_sign",
  "minecraft:bamboo_hanging_sign",
  "minecraft:candle",
  "minecraft:black_candle",
  "minecraft:blue_candle",
  "minecraft:brown_candle",
  "minecraft:cyan_candle",
  "minecraft:gray_candle",
  "minecraft:green_candle",
  "minecraft:light_blue_candle",
  "minecraft:lime_candle",
  "minecraft:magenta_candle",
  "minecraft:orange_candle",
  "minecraft:pink_candle",
  "minecraft:purple_candle",
  "minecraft:red_candle",
  "minecraft:light_gray_candle",
  "minecraft:white_candle",
  "minecraft:yellow_candle",
  "minecraft:fire_coral",
  "minecraft:bubble_coral",
  "minecraft:brain_coral",
  "minecraft:tube_coral",
  "minecraft:horn_coral",
  "minecraft:fire_coral_fan",
  "minecraft:bubble_coral_fan",
  "minecraft:brain_coral_fan",
  "minecraft:tube_coral_fan",
  "minecraft:horn_coral_fan",
  "minecraft:dead_fire_coral",
  "minecraft:dead_bubble_coral",
  "minecraft:dead_brain_coral",
  "minecraft:dead_tube_coral",
  "minecraft:dead_horn_coral",
  "minecraft:dead_fire_coral_fan",
  "minecraft:dead_bubble_coral_fan",
  "minecraft:dead_brain_coral_fan",
  "minecraft:dead_tube_coral_fan",
  "minecraft:dead_horn_coral_fan",
  "minecraft:exposed_copper_door",
  "minecraft:weathered_copper_door",
  "minecraft:oxidized_copper_door",
  "minecraft:waxed_exposed_copper_door",
  "minecraft:waxed_copper_door",
  "minecraft:waxed_oxidized_copper_door",
  "minecraft:waxed_weathered_copper_door",
  "minecraft:copper_trapdoor",
  "minecraft:exposed_copper_trapdoor",
  "minecraft:weathered_copper_trapdoor",
  "minecraft:oxidized_copper_trapdoor",
  "minecraft:waxed_exposed_copper_trapdoor",
  "minecraft:waxed_copper_trapdoor",
  "minecraft:waxed_oxidized_copper_trapdoor",
  "minecraft:waxed_weathered_copper_trapdoor",
  "minecraft:exposed_copper",
  "minecraft:weathered_copper",
  "minecraft:oxidized_copper",
  "minecraft:copper_grate",
  "minecraft:exposed_copper_grate",
  "minecraft:weathered_copper_grate",
  "minecraft:oxidized_copper_grate",
  "minecraft:waxed_copper",
  "minecraft:waxed_exposed_copper",
  "minecraft:waxed_weathered_copper",
  "minecraft:waxed_oxidized_copper",
  "minecraft:waxed_copper_grate",
  "minecraft:waxed_exposed_copper_grate",
  "minecraft:waxed_weathered_copper_grate",
  "minecraft:waxed_oxidized_copper_grate",
  "minecraft:exposed_cut_copper",
  "minecraft:weathered_cut_copper",
  "minecraft:oxidized_cut_copper",
  "minecraft:waxed_cut_copper",
  "minecraft:waxed_exposed_cut_copper",
  "minecraft:waxed_weathered_cut_copper",
  "minecraft:waxed_oxidized_cut_copper",
  "minecraft:chiseled_copper",
  "minecraft:exposed_chiseled_copper",
  "minecraft:weathered_chiseled_copper",
  "minecraft:oxidized_chiseled_copper",
  "minecraft:waxed_chiseled_copper",
  "minecraft:waxed_exposed_chiseled_copper",
  "minecraft:waxed_weathered_chiseled_copper",
  "minecraft:waxed_oxidized_chiseled_copper",
  "minecraft:copper_bulb",
  "minecraft:exposed_copper_bulb",
  "minecraft:weathered_copper_bulb",
  "minecraft:oxidized_copper_bulb",
  "minecraft:waxed_copper_bulb",
  "minecraft:waxed_exposed_copper_bulb",
  "minecraft:waxed_weathered_copper_bulb",
  "minecraft:waxed_oxidized_copper_bulb",
  "minecraft:cobblestone_wall",
  "minecraft:polished_blackstone_wall",
  "minecraft:mud_brick_wall",
  "minecraft:deepslate_tile_wall",
  "minecraft:cobbled_deepslate_wall",
  "minecraft:deepslate_brick_wall",
  "minecraft:polished_blackstone_brick_wall",
  "minecraft:blackstone_wall",
  "minecraft:polished_deepslate_wall",
  "minecraft:lightning_rod",
  "minecraft:acacia_fence",
  "minecraft:mangrove_fence",
  "minecraft:dark_oak_fence",
  "minecraft:birch_fence",
  "minecraft:jungle_fence",
  "minecraft:oak_fence",
  "minecraft:spruce_fence",
  "minecraft:warped_fence",
  "minecraft:crimson_fence",
  "minecraft:cherry_fence",
  "minecraft:bamboo_fence",
  "minecraft:nether_brick_fence",
  "minecraft:acacia_fence_gate",
  "minecraft:mangrove_fence_gate",
  "minecraft:dark_oak_fence_gate",
  "minecraft:birch_fence_gate",
  "minecraft:jungle_fence_gate",
  "minecraft:fence_gate",
  "minecraft:spruce_fence_gate",
  "minecraft:warped_fence_gate",
  "minecraft:crimson_fence_gate",
  "minecraft:cherry_fence_gate",
  "minecraft:bamboo_fence_gate",
  "minecraft:apple",
  "minecraft:bone_meal",
  "minecraft:ink_sac",
  "minecraft:lapis_lazuli",
  "minecraft:cocoa_beans",
  "minecraft:black_dye",
  "minecraft:blue_dye",
  "minecraft:brown_dye",
  "minecraft:cyan_dye",
  "minecraft:gray_dye",
  "minecraft:green_dye",
  "minecraft:light_blue_dye",
  "minecraft:lime_dye",
  "minecraft:magenta_dye",
  "minecraft:orange_dye",
  "minecraft:pink_dye",
  "minecraft:purple_dye",
  "minecraft:red_dye",
  "minecraft:light_gray_dye",
  "minecraft:white_dye",
  "minecraft:yellow_dye",
  "minecraft:glow_ink_sac",
  "minecraft:pointed_dripstone",
  "minecraft:weeping_vines",
  "minecraft:twisting_vines",
  "minecraft:vine",
  "minecraft:seagrass",
  "minecraft:deadbush",
  "minecraft:tallgrass",
  "minecraft:double_plant",
  "minecraft:poppy",
  "minecraft:yellow_flower",
  "minecraft:blue_orchid",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:oxeye_daisy",
  "minecraft:pink_tulip",
  "minecraft:lily_of_the_valley",
  "minecraft:cornflower",
  "minecraft:pitcher_plant",
  "minecraft:pink_petals",
  "minecraft:wither_rose",
  "minecraft:torchflower",
  "minecraft:armor_stand",
  "minecraft:arrow",
  "minecraft:bamboo",
  "minecraft:banner_pattern",
  "minecraft:bed",
  "minecraft:cooked_beef",
  "minecraft:beef",
  "minecraft:beetroot_soup",
  "minecraft:beetroot",
  "minecraft:blaze_powder",
  "minecraft:blaze_rod",
  "minecraft:acacia_boat",
  "minecraft:birch_boat",
  "minecraft:dark_oak_boat",
  "minecraft:jungle_boat",
  "minecraft:oak_boat",
  "minecraft:spruce_boat",
  "minecraft:bone",
  "minecraft:enchanted_book",
  "minecraft:book",
  "minecraft:writable_book",
  "minecraft:written_book",
  "minecraft:bow",
  "minecraft:bowl",
  "minecraft:bread",
  "minecraft:brewing_stand",
  "minecraft:brick",
  "minecraft:broken_elytra",
  "minecraft:cod_bucket",
  "minecraft:bucket",
  "minecraft:lava_bucket",
  "minecraft:milk_bucket",
  "minecraft:pufferfish_bucket",
  "minecraft:salmon_bucket",
  "minecraft:tropical_fish_bucket",
  "minecraft:water_bucket",
  "minecraft:cake",
  "minecraft:campfire",
  "minecraft:golden_apple",
  "minecraft:enchanted_golden_apple",
  "minecraft:golden_carrot",
  "minecraft:carrot_on_a_stick",
  "minecraft:carrot",
  "minecraft:cauldron",
  "minecraft:chainmail_boots",
  "minecraft:chainmail_chestplate",
  "minecraft:chainmail_helmet",
  "minecraft:chainmail_leggings",
  "minecraft:charcoal",
  "minecraft:cooked_chicken",
  "minecraft:chicken",
  "minecraft:chorus_fruit_popped",
  "minecraft:chorus_fruit",
  "minecraft:popped_chorus_fruit",
  "minecraft:chorus_flower",
  "minecraft:chorus_plant",
  "minecraft:clay_ball",
  "minecraft:clock",
  "minecraft:coal",
  "minecraft:comparator",
  "minecraft:compass",
  "minecraft:cookie",
  "minecraft:mace",
  "minecraft:wind_charge",
  "minecraft:crossbow",
  "minecraft:crossbow_firework",
  "minecraft:firework_rocket",
  "minecraft:firework_star",
  "minecraft:diamond",
  "minecraft:diamond_axe",
  "minecraft:potion",
  "minecraft:splash_potion",
  "minecraft:lingering_potion",
  "minecraft:diamond_pickaxe",
  "minecraft:diamond_boots",
  "minecraft:diamond_chestplate",
  "minecraft:diamond_leggings",
  "minecraft:diamond_hoe",
  "minecraft:diamond_horse_armor",
  "minecraft:diamond_helmet",
  "minecraft:diamond_shovel",
  "minecraft:diamond_sword",
  "minecraft:acacia_door",
  "minecraft:birch_door",
  "minecraft:dark_oak_door",
  "minecraft:jungle_door",
  "minecraft:wooden_door",
  "minecraft:spruce_door",
  "minecraft:iron_door",
  "minecraft:dragon_fireball",
  "minecraft:dragon_breath",
  "minecraft:dried_kelp",
  "minecraft:egg",
  "minecraft:elytra",
  "minecraft:emerald",
  "minecraft:end_crystal",
  "minecraft:ender_eye",
  "minecraft:ender_pearl",
  "minecraft:experience_bottle",
  "minecraft:glass_bottle",
  "minecraft:bed",
  "minecraft:feather",
  "minecraft:fireball",
  "minecraft:fireworks",
  "minecraft:tropical_fish",
  "minecraft:cooked_cod",
  "minecraft:pufferfish",
  "minecraft:cod",
  "minecraft:cooked_salmon",
  "minecraft:target",
  "minecraft:loom",
  "minecraft:crafter",
  "minecraft:redstone_torch",
  "minecraft:torch",
  "minecraft:soul_torch",
  "minecraft:salmon",
  "minecraft:fishing_rod",
  "minecraft:flint",
  "minecraft:flint_and_steel",
  "minecraft:flower_pot",
  "minecraft:ghast_tear",
  "minecraft:glowstone_dust",
  "minecraft:golden_axe",
  "minecraft:golden_boots",
  "minecraft:golden_chestplate",
  "minecraft:golden_helmet",
  "minecraft:golden_hoe",
  "minecraft:golden_horse_armor",
  "minecraft:leather_horse_armor",
  "minecraft:gold_ingot",
  "minecraft:golden_leggings",
  "minecraft:gold_nugget",
  "minecraft:golden_pickaxe",
  "minecraft:golden_shovel",
  "minecraft:golden_sword",
  "minecraft:gunpowder",
  "minecraft:heart_of_the_sea",
  "minecraft:hopper",
  "minecraft:iron_axe",
  "minecraft:iron_boots",
  "minecraft:iron_chestplate",
  "minecraft:iron_helmet",
  "minecraft:iron_hoe",
  "minecraft:iron_horse_armor",
  "minecraft:iron_ingot",
  "minecraft:iron_leggings",
  "minecraft:iron_nugget",
  "minecraft:iron_pickaxe",
  "minecraft:iron_shovel",
  "minecraft:iron_sword",
  "minecraft:frame",
  "minecraft:kelp",
  "minecraft:lantern",
  "minecraft:lead",
  "minecraft:leather_chestplate",
  "minecraft:leather_helmet",
  "minecraft:leather_leggings",
  "minecraft:leather_boots",
  "minecraft:leather",
  "minecraft:lever",
  "minecraft:magma_cream",
  "minecraft:empty_map",
  "minecraft:glistering_melon_slice",
  "minecraft:melon_slice",
  "minecraft:chest_minecart",
  "minecraft:command_block_minecart",
  "minecraft:furnace_minecart",
  "minecraft:hopper_minecart",
  "minecraft:minecart",
  "minecraft:tnt_minecart",
  "minecraft:mushroom_stew",
  "minecraft:mutton",
  "minecraft:cooked_mutton",
  "minecraft:name_tag",
  "minecraft:nautilus_shell",
  "minecraft:nether_star",
  "minecraft:nether_wart",
  "minecraft:netherbrick",
  "minecraft:painting",
  "minecraft:paper",
  "minecraft:phantom_membrane",
  "minecraft:cooked_porkchop",
  "minecraft:porkchop",
  "minecraft:potato",
  "minecraft:baked_potato",
  "minecraft:poisonous_potato",
  "minecraft:prismarine_crystals",
  "minecraft:prismarine_shard",
  "minecraft:pumpkin_pie",
  "minecraft:quartz",
  "minecraft:cooked_rabbit",
  "minecraft:rabbit_foot",
  "minecraft:rabbit_hide",
  "minecraft:rabbit",
  "minecraft:rabbit_stew",
  "minecraft:redstone",
  "minecraft:reeds",
  "minecraft:repeater",
  "minecraft:rotten_flesh",
  "minecraft:saddle",
  "minecraft:sea_pickle",
  "minecraft:beetroot_seeds",
  "minecraft:melon_seeds",
  "minecraft:pumpkin_seeds",
  "minecraft:wheat_seeds",
  "minecraft:shears",
  "minecraft:shulker_shell",
  "minecraft:slime_ball",
  "minecraft:snowball",
  "minecraft:fermented_spider_eye",
  "minecraft:spider_eye",
  "minecraft:stick",
  "minecraft:stone_axe",
  "minecraft:stone_hoe",
  "minecraft:stone_pickaxe",
  "minecraft:stone_shovel",
  "minecraft:stone_sword",
  "minecraft:string",
  "minecraft:trial_key",
  "minecraft:sugar",
  "minecraft:sugar_cane",
  "minecraft:suspicious_stew",
  "minecraft:sweet_berries",
  "minecraft:totem_of_undying",
  "minecraft:trident",
  "minecraft:turtle_egg",
  "minecraft:turtle_helmet",
  "minecraft:turtle_scute",
  "minecraft:fire_charge",
  "minecraft:breeze_rod",
  "minecraft:villagebell",
  "minecraft:wheat",
  "minecraft:wooden_axe",
  "minecraft:wooden_hoe",
  "minecraft:wooden_pickaxe",
  "minecraft:wooden_shovel",
  "minecraft:wooden_sword",
  "minecraft:honey_bottle",
  "minecraft:honeycomb",
  "minecraft:warped_door",
  "minecraft:soul_campfire",
  "minecraft:netherite_axe",
  "minecraft:netherite_boots",
  "minecraft:netherite_chestplate",
  "minecraft:netherite_helmet",
  "minecraft:netherite_hoe",
  "minecraft:netherite_ingot",
  "minecraft:netherite_leggings",
  "minecraft:netherite_pickaxe",
  "minecraft:netherite_scrap",
  "minecraft:netherite_shovel",
  "minecraft:netherite_sword",
  "minecraft:soul_lantern",
  "minecraft:nether_sprouts",
  "minecraft:crimson_door",
  "minecraft:warped_fungus_on_a_stick",
  "minecraft:chain",
  "minecraft:amethyst_shard",
  "minecraft:copper_ingot",
  "minecraft:raw_iron",
  "minecraft:glow_berries",
  "minecraft:spyglass",
  "minecraft:powder_snow_bucket",
  "minecraft:glow_frame",
  "minecraft:bell",
  "minecraft:raw_gold",
  "minecraft:axolotl_bucket",
  "minecraft:raw_copper",
  "minecraft:dye_powder_glow",
  "minecraft:acacia_chest_boat",
  "minecraft:birch_chest_boat",
  "minecraft:dark_oak_chest_boat",
  "minecraft:jungle_chest_boat",
  "minecraft:oak_chest_boat",
  "minecraft:spruce_chest_boat",
  "minecraft:mangrove_chest_boat",
  "minecraft:mangrove_boat",
  "minecraft:tadpole_bucket",
  "minecraft:recovery_compass",
  "minecraft:mangrove_propagule",
  "minecraft:echo_shard",
  "minecraft:fragment_disc",
  "minecraft:mangrove_door",
  "minecraft:goat_horn",
  "minecraft:brush",
  "minecraft:sniffer_egg",
  "minecraft:bamboo_chest_raft",
  "minecraft:bamboo_raft",
  "minecraft:cherry_chest_boat",
  "minecraft:cherry_boat",
  "minecraft:cherry_door",
  "minecraft:bamboo_door",
  "minecraft:pitcher_pod",
  "minecraft:torchflower_seeds",
  "minecraft:armadillo_scute",
  "minecraft:wolf_armor",
  "minecraft:cactus",
  "minecraft:redstone_block",
  "minecraft:sea_lantern",
  "minecraft:cartography_table",
  "minecraft:anvil",
  "minecraft:barrel",
  "minecraft:beacon",
  "minecraft:bedrock",
  "minecraft:blast_furnace",
  "minecraft:blue_ice",
  "minecraft:bone_block",
  "minecraft:bookshelf",
  "minecraft:brick_block",
  "minecraft:cake",
  "minecraft:waterlily",
  "minecraft:chest",
  "minecraft:clay",
  "minecraft:coal_block",
  "minecraft:coal_ore",
  "minecraft:coarse_dirt",
  "minecraft:mossy_cobblestone",
  "minecraft:moss_block",
  "minecraft:moss_carpet",
  "minecraft:spore_blossom",
  "minecraft:cobblestone",
  "minecraft:composter",
  "minecraft:concrete_powder",
  "minecraft:concrete",
  "minecraft:crafting_table",
  "minecraft:daylight_detector",
  "minecraft:diamond_block",
  "minecraft:diamond_ore",
  "minecraft:podzol",
  "minecraft:dirt",
  "minecraft:dispenser",
  "minecraft:dragon_egg",
  "minecraft:hanging_roots",
  "minecraft:mangrove_roots",
  "minecraft:crimson_roots",
  "minecraft:warped_roots",
  "minecraft:muddy_mangrove_roots",
  "minecraft:dried_kelp_block",
  "minecraft:dropper",
  "minecraft:emerald_block",
  "minecraft:emerald_ore",
  "minecraft:enchanting_table",
  "minecraft:end_bricks",
  "minecraft:end_stone",
  "minecraft:ender_chest",
  "minecraft:web",
  "minecraft:frog_spawn",
  "minecraft:end_portal_frame",
  "minecraft:farmland",
  "minecraft:fletching_table",
  "minecraft:red_flower",
  "minecraft:frosted_ice",
  "minecraft:furnace",
  "minecraft:glass",
  "minecraft:black_stained_glass",
  "minecraft:blue_stained_glass",
  "minecraft:brown_stained_glass",
  "minecraft:cyan_stained_glass",
  "minecraft:gray_stained_glass",
  "minecraft:green_stained_glass",
  "minecraft:light_blue_stained_glass",
  "minecraft:lime_stained_glass",
  "minecraft:magenta_stained_glass",
  "minecraft:orange_stained_glass",
  "minecraft:pink_stained_glass",
  "minecraft:purple_stained_glass",
  "minecraft:red_stained_glass",
  "minecraft:light_gray_stained_glass",
  "minecraft:white_stained_glass",
  "minecraft:yellow_stained_glass",
  "minecraft:glass_pane",
  "minecraft:black_stained_glass_pane",
  "minecraft:blue_stained_glass_pane",
  "minecraft:brown_stained_glass_pane",
  "minecraft:cyan_stained_glass_pane",
  "minecraft:gray_stained_glass_pane",
  "minecraft:green_stained_glass_pane",
  "minecraft:light_blue_stained_glass_pane",
  "minecraft:lime_stained_glass_pane",
  "minecraft:magenta_stained_glass_pane",
  "minecraft:orange_stained_glass_pane",
  "minecraft:pink_stained_glass_pane",
  "minecraft:purple_stained_glass_pane",
  "minecraft:red_stained_glass_pane",
  "minecraft:light_gray_stained_glass_pane",
  "minecraft:white_stained_glass_pane",
  "minecraft:yellow_stained_glass_pane",
  "minecraft:black_glazed_terracotta",
  "minecraft:blue_glazed_terracotta",
  "minecraft:brown_glazed_terracotta",
  "minecraft:cyan_glazed_terracotta",
  "minecraft:gray_glazed_terracotta",
  "minecraft:green_glazed_terracotta",
  "minecraft:light_blue_glazed_terracotta",
  "minecraft:lime_glazed_terracotta",
  "minecraft:magenta_glazed_terracotta",
  "minecraft:orange_glazed_terracotta",
  "minecraft:pink_glazed_terracotta",
  "minecraft:purple_glazed_terracotta",
  "minecraft:red_glazed_terracotta",
  "minecraft:silver_glazed_terracotta",
  "minecraft:white_glazed_terracotta",
  "minecraft:yellow_glazed_terracotta",
  "minecraft:glowstone",
  "minecraft:glow_lichen",
  "minecraft:gold_block",
  "minecraft:gold_ore",
  "minecraft:grass_block",
  "minecraft:grass_path",
  "minecraft:gravel",
  "minecraft:stained_hardened_clay",
  "minecraft:hardened_clay",
  "minecraft:hay_block",
  "minecraft:ice",
  "minecraft:packed_ice",
  "minecraft:iron_bars",
  "minecraft:tripwire_hook",
  "minecraft:banner",
  "minecraft:iron_block",
  "minecraft:iron_ore",
  "minecraft:iron_trapdoor",
  "minecraft:jukebox",
  "minecraft:ladder",
  "minecraft:lapis_block",
  "minecraft:lapis_ore",
  "minecraft:lectern",
  "minecraft:acacia_log",
  "minecraft:dark_oak_log",
  "minecraft:birch_log",
  "minecraft:jungle_log",
  "minecraft:oak_log",
  "minecraft:spruce_log",
  "minecraft:acacia_wood",
  "minecraft:dark_oak_wood",
  "minecraft:birch_wood",
  "minecraft:jungle_wood",
  "minecraft:oak_wood",
  "minecraft:spruce_wood",
  "minecraft:mangrove_wood",
  "minecraft:cherry_wood",
  "minecraft:warped_stem",
  "minecraft:warped_hyphae",
  "minecraft:stripped_warped_hyphae",
  "minecraft:crimson_stem",
  "minecraft:crimson_hyphae",
  "minecraft:stripped_crimson_hyphae",
  "minecraft:cherry_log",
  "minecraft:cherry_wood",
  "minecraft:magma",
  "minecraft:melon_block",
  "minecraft:warped_fungus",
  "minecraft:crimson_fungus",
  "minecraft:red_mushroom",
  "minecraft:brown_mushroom",
  "minecraft:red_mushroom_block",
  "minecraft:brown_mushroom_block",
  "minecraft:mycelium",
  "minecraft:nether_brick",
  "minecraft:nether_wart_block",
  "minecraft:netherrack",
  "minecraft:noteblock",
  "minecraft:observer",
  "minecraft:obsidian",
  "minecraft:warped_wart_block",
  "minecraft:granite",
  "minecraft:polished_granite",
  "minecraft:polished_diorite",
  "minecraft:polished_andesite",
  "minecraft:diorite",
  "minecraft:andesite",
  "minecraft:piston",
  "minecraft:sticky_piston",
  "minecraft:acacia_planks",
  "minecraft:mangrove_planks",
  "minecraft:dark_oak_planks",
  "minecraft:birch_planks",
  "minecraft:jungle_planks",
  "minecraft:oak_planks",
  "minecraft:spruce_planks",
  "minecraft:warped_planks",
  "minecraft:crimson_planks",
  "minecraft:cherry_planks",
  "minecraft:prismarine",
  "minecraft:prismarine_dark",
  "minecraft:carved_pumpkin",
  "minecraft:lit_pumpkin",
  "minecraft:pumpkin",
  "minecraft:purpur_block",
  "minecraft:quartz_block",
  "minecraft:quartz_ore",
  "minecraft:rail",
  "minecraft:activator_rail",
  "minecraft:detector_rail",
  "minecraft:golden_rail",
  "minecraft:red_sandstone",
  "minecraft:red_nether_brick",
  "minecraft:redstone_lamp",
  "minecraft:redstone_ore",
  "minecraft:sand",
  "minecraft:sandstone",
  "minecraft:oak_sapling",
  "minecraft:acacia_sapling",
  "minecraft:birch_sapling",
  "minecraft:jungle_sapling",
  "minecraft:dark_oak_sapling",
  "minecraft:spruce_sapling",
  "minecraft:cherry_sapling",
  "minecraft:black_shulker_box",
  "minecraft:blue_shulker_box",
  "minecraft:brown_shulker_box",
  "minecraft:cyan_shulker_box",
  "minecraft:gray_shulker_box",
  "minecraft:green_shulker_box",
  "minecraft:light_blue_shulker_box",
  "minecraft:lime_shulker_box",
  "minecraft:magenta_shulker_box",
  "minecraft:orange_shulker_box",
  "minecraft:pink_shulker_box",
  "minecraft:purple_shulker_box",
  "minecraft:red_shulker_box",
  "minecraft:light_gray_shulker_box",
  "minecraft:undyed_shulker_box",
  "minecraft:white_shulker_box",
  "minecraft:yellow_shulker_box",
  "minecraft:slime",
  "minecraft:smithing_table",
  "minecraft:smoker",
  "minecraft:snow_block",
  "minecraft:snow",
  "minecraft:snow_layer",
  "minecraft:soul_sand",
  "minecraft:sponge",
  "minecraft:stone",
  "minecraft:stonebrick",
  "minecraft:stonecutter_block",
  "minecraft:stripped_acacia_log",
  "minecraft:stripped_birch_log",
  "minecraft:stripped_oak_log",
  "minecraft:stripped_dark_oak_log",
  "minecraft:stripped_jungle_log",
  "minecraft:stripped_spruce_log",
  "minecraft:stripped_acacia_wood",
  "minecraft:stripped_birch_wood",
  "minecraft:stripped_oak_wood",
  "minecraft:stripped_dark_oak_wood",
  "minecraft:stripped_jungle_wood",
  "minecraft:stripped_spruce_wood",
  "minecraft:stripped_crimson_stem",
  "minecraft:stripped_warped_stem",
  "minecraft:stripped_cherry_log",
  "minecraft:stripped_cherry_wood",
  "minecraft:tnt",
  "minecraft:trapped_chest",
  "minecraft:spruce_trapdoor",
  "minecraft:trapdoor",
  "minecraft:jungle_trapdoor",
  "minecraft:dark_oak_trapdoor",
  "minecraft:acacia_trapdoor",
  "minecraft:birch_trapdoor",
  "minecraft:mangrove_trapdoor",
  "minecraft:warped_trapdoor",
  "minecraft:crimson_trapdoor",
  "minecraft:black_wool",
  "minecraft:blue_wool",
  "minecraft:brown_wool",
  "minecraft:cyan_wool",
  "minecraft:gray_wool",
  "minecraft:green_wool",
  "minecraft:light_blue_wool",
  "minecraft:lime_wool",
  "minecraft:magenta_wool",
  "minecraft:orange_wool",
  "minecraft:pink_wool",
  "minecraft:purple_wool",
  "minecraft:red_wool",
  "minecraft:light_gray_wool",
  "minecraft:white_wool",
  "minecraft:yellow_wool",
  "minecraft:black_carpet",
  "minecraft:blue_carpet",
  "minecraft:brown_carpet",
  "minecraft:cyan_carpet",
  "minecraft:gray_carpet",
  "minecraft:green_carpet",
  "minecraft:light_blue_carpet",
  "minecraft:lime_carpet",
  "minecraft:magenta_carpet",
  "minecraft:orange_carpet",
  "minecraft:pink_carpet",
  "minecraft:purple_carpet",
  "minecraft:red_carpet",
  "minecraft:light_gray_carpet",
  "minecraft:white_carpet",
  "minecraft:yellow_carpet",
  "minecraft:black_concrete_powder",
  "minecraft:blue_concrete_powder",
  "minecraft:brown_concrete_powder",
  "minecraft:cyan_concrete_powder",
  "minecraft:gray_concrete_powder",
  "minecraft:green_concrete_powder",
  "minecraft:light_blue_concrete_powder",
  "minecraft:lime_concrete_powder",
  "minecraft:magenta_concrete_powder",
  "minecraft:orange_concrete_powder",
  "minecraft:pink_concrete_powder",
  "minecraft:purple_concrete_powder",
  "minecraft:red_concrete_powder",
  "minecraft:light_gray_concrete_powder",
  "minecraft:white_concrete_powder",
  "minecraft:yellow_concrete_powder",
  "minecraft:black_concrete",
  "minecraft:blue_concrete",
  "minecraft:brown_concrete",
  "minecraft:cyan_concrete",
  "minecraft:gray_concrete",
  "minecraft:green_concrete",
  "minecraft:light_blue_concrete",
  "minecraft:lime_concrete",
  "minecraft:magenta_concrete",
  "minecraft:orange_concrete",
  "minecraft:pink_concrete",
  "minecraft:purple_concrete",
  "minecraft:red_concrete",
  "minecraft:light_gray_concrete",
  "minecraft:white_concrete",
  "minecraft:yellow_concrete",
  "minecraft:bee_nest",
  "minecraft:beehive",
  "minecraft:honey_block",
  "minecraft:honeycomb_block",
  "minecraft:ancient_debris",
  "minecraft:basalt",
  "minecraft:blackstone",
  "minecraft:crimson_nylium",
  "minecraft:crying_obsidian",
  "minecraft:gilded_blackstone",
  "minecraft:lodestone",
  "minecraft:nether_brick",
  "minecraft:nether_gold_ore",
  "minecraft:netherite_block",
  "minecraft:polished_basalt",
  "minecraft:polished_blackstone",
  "minecraft:polished_blackstone_bricks",
  "minecraft:cracked_polished_blackstone_bricks",
  "minecraft:quartz_bricks",
  "minecraft:respawn_anchor",
  "minecraft:shroomlight",
  "minecraft:soul_soil",
  "minecraft:warped_nylium",
  "minecraft:deepslate_coal_ore",
  "minecraft:deepslate_copper_ore",
  "minecraft:deepslate_diamond_ore",
  "minecraft:deepslate_emerald_ore",
  "minecraft:deepslate_iron_ore",
  "minecraft:deepslate_gold_ore",
  "minecraft:deepslate_redstone_ore",
  "minecraft:deepslate_lapis_ore",
  "minecraft:chiseled_deepslate",
  "minecraft:chiseled_polished_blackstone",
  "minecraft:cracked_deepslate_bricks",
  "minecraft:cracked_deepslate_tiles",
  "minecraft:deepslate_bricks",
  "minecraft:deepslate_tiles",
  "minecraft:cobbled_deepslate",
  "minecraft:deepslate",
  "minecraft:polished_deepslate",
  "minecraft:amethyst_block",
  "minecraft:amethyst_cluster",
  "minecraft:large_amethyst_bud",
  "minecraft:medium_amethyst_bud",
  "minecraft:small_amethyst_bud",
  "minecraft:amethyst",
  "minecraft:azalea_leaves_flowered",
  "minecraft:azalea_leaves",
  "minecraft:acacia_leaves",
  "minecraft:birch_leaves",
  "minecraft:dark_oak_leaves",
  "minecraft:jungle_leaves",
  "minecraft:oak_leaves",
  "minecraft:spruce_leaves",
  "minecraft:cherry_leaves",
  "minecraft:mangrove_leaves",
  "minecraft:budding_amethyst",
  "minecraft:calcite",
  "minecraft:copper_block",
  "minecraft:copper_ore",
  "minecraft:cut_copper",
  "minecraft:dripstone_block",
  "minecraft:dirt_with_roots",
  "minecraft:oxidized_copper",
  "minecraft:powder_snow",
  "minecraft:raw_copper_block",
  "minecraft:raw_iron_block",
  "minecraft:raw_gold_block",
  "minecraft:smooth_basalt",
  "minecraft:smooth_stone",
  "minecraft:tinted_glass",
  "minecraft:tuff",
  "minecraft:chiseled_tuff",
  "minecraft:chiseled_tuff_bricks",
  "minecraft:polished_tuff",
  "minecraft:tuff_bricks",
  "minecraft:mob_spawner",
  "minecraft:monster_egg",
  "minecraft:coral_block",
  "minecraft:infested_deepslate",
  "minecraft:mangrove_log",
  "minecraft:mud",
  "minecraft:mud_bricks",
  "minecraft:packed_mud",
  "minecraft:reinforced_deepslate",
  "minecraft:sculk_catalyst",
  "minecraft:sculk",
  "minecraft:sculk_vein",
  "minecraft:sculk_shrieker",
  "minecraft:sculk_sensor",
  "minecraft:calibrated_sculk_sensor",
  "minecraft:scaffolding",
  "minecraft:ochre_froglight",
  "minecraft:pearlescent_froglight",
  "minecraft:verdant_froglight",
  "minecraft:stripped_mangrove_log",
  "minecraft:stripped_mangrove_wood",
  "minecraft:bamboo_block",
  "minecraft:bamboo_planks",
  "minecraft:bamboo_mosaic",
  "minecraft:bamboo_trapdoor",
  "minecraft:cherry_trapdoor",
  "minecraft:chiseled_bookshelf",
  "minecraft:chiseled_nether_bricks",
  "minecraft:decorated_pot",
  "minecraft:cracked_nether_bricks",
  "minecraft:stripped_bamboo_block",
  "minecraft:suspicious_gravel",
  "minecraft:suspicious_sand"
]

export function setFrequency(key, quantity, ajustItem, itemm) {
  let stored = mc.world.getDynamicProperty("rc_sd:WorldFrequency")
  let data = stored ? JSON.parse(stored) : {}

  data[key] = {
    quantity,
    ajust_item: ajustItem,
    item: serializeItem(itemm)
  }

  mc.world.setDynamicProperty("rc_sd:WorldFrequency", JSON.stringify(data))
}

export function getFrequencyData(key) {
  const stored = mc.world.getDynamicProperty("rc_sd:WorldFrequency")
  if (!stored) return null

  const data = JSON.parse(stored)
  return data[key] ?? null
}

export function deleteFrequency(key) {
  const stored = mc.world.getDynamicProperty("rc_sd:WorldFrequency");
  if (!stored) return;

  const frequencyData = JSON.parse(stored);

  if (!(key in frequencyData)) return;

  delete frequencyData[key];

  mc.world.setDynamicProperty("rc_sd:WorldFrequency", JSON.stringify(frequencyData));
}

export function serializeItem(item) {
  if (!item) return null;

  const durability = item.getComponent("durability");
  const damage = durability ? durability.damage : undefined;

  return {
    typeId: item.typeId,
    amount: 1,
    damage: damage,
    lore: item.getLore(),
    nameTag: item.nameTag,
    lockMode: item.lockMode,
    keepOnDeath: item.keepOnDeath,
    canDestroy: item.getCanDestroy(),
    canPlaceOn: item.getCanPlaceOn(),
    enchantments: item.getComponent("enchantable")?.getEnchantments()?.map(e => ({
      type: e.type.id,
      level: e.level
    })),
    dynamicProperties: item.getDynamicPropertyIds()?.map(id => [id, item.getDynamicProperty(id)])
  };
}



export function loadInv(itemData) {
  if (!itemData?.typeId) return null;

  const item = new mc.ItemStack(itemData.typeId, itemData.amount ?? 1);

  if (itemData.nameTag) item.nameTag = itemData.nameTag;
  if (itemData.lore) item.setLore(itemData.lore);
  if (itemData.lockMode) item.lockMode = itemData.lockMode;
  if (itemData.keepOnDeath) item.keepOnDeath = itemData.keepOnDeath;
  if (itemData.canDestroy) item.setCanDestroy(itemData.canDestroy);
  if (itemData.canPlaceOn) item.setCanPlaceOn(itemData.canPlaceOn);

  // ⚠️ Aqui é onde garantimos que o dano será aplicado corretamente
  const durabilityComp = item.getComponent("durability");
  if (durabilityComp && typeof itemData.damage === "number") {
    durabilityComp.damage = itemData.damage;
  }

  if (itemData.enchantments?.length && item.hasComponent("enchantable")) {
    const enchComp = item.getComponent("enchantable");
    for (const { type, level } of itemData.enchantments) {
      const ench = new mc.EnchantmentType(type);
      enchComp.addEnchantment({ type: ench, level });
    }
  }

  if (itemData.dynamicProperties?.length) {
    for (const [id, value] of itemData.dynamicProperties) {
      item.setDynamicProperty(id, value);
    }
  }

  return item;
}



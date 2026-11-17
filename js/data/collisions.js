const collisionsLevel1 = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292,
  292, 292, 292, 0, 0, 292, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 292, 0, 0, 292,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 292, 0, 0, 292, 292, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 292, 0, 0, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292,
  292, 292, 292, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

const collisionShapesLevel1 = [
  { id: 'LEVEL1_CEILING', x: 155, y: 222, width: 1085, height: 26, type: 'ceiling' },
  { id: 'LEVEL1_WALL_LEFT', x: 132, y: 242, width: 28, height: 306, type: 'wall' },
  { id: 'LEVEL1_WALL_RIGHT', x: 1238, y: 242, width: 28, height: 306, type: 'wall' },
  { id: 'LEVEL1_FLOOR', x: 156, y: 546, width: 1083, height: 18, type: 'oneWay' },
]

const collisionsLevel2 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 11; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevel2 = [
  { id: 'LEVEL2_UPPER_CEILING', x: 90, y: 80, width: 318, height: 8, type: 'ceiling' },
  { id: 'LEVEL2_UPPER_LEFT_WALL', x: 80, y: 80, width: 8, height: 214, type: 'wall' },
  { id: 'LEVEL2_UPPER_RIGHT_WALL', x: 398, y: 0, width: 8, height: 480, type: 'wall' },
  { id: 'LEVEL2_UPPER_LEFT_PLATFORM', x: 94, y: 288, width: 120, height: 8, type: 'solid' },
  { id: 'LEVEL2_SHAFT_LEFT_WALL', x: 214, y: 288, width: 8, height: 204, type: 'wall' },
  { id: 'LEVEL2_LOWER_UPPER_EDGE', x: 72, y: 442, width: 198, height: 8, type: 'solid' },
  { id: 'LEVEL2_LOWER_LEFT_WALL', x: 72, y: 442, width: 8, height: 242, type: 'wall' },
  { id: 'LEVEL2_LOWER_FLOOR', x: 88, y: 674, width: 648, height: 8, type: 'solid' },
  { id: 'LEVEL2_LOWER_RIGHT_WALL', x: 716, y: 594, width: 8, height: 80, type: 'wall' },

  { id: 'LEVEL2_SHAFT_PLATFORM', x: 398, y: 480, width: 258, height: 8, type: 'solid' },
  { id: 'LEVEL2_SHAFT_PLATFORM_END_WALL', x: 648, y: 360, width: 8, height: 120, type: 'wall' },

  { id: 'LEVEL2_RIGHT_CEILING', x: 628, y: 412, width: 312, height: 8, type: 'ceiling' },
  { id: 'LEVEL2_RIGHT_LEFT_WALL', x: 628, y: 412, width: 8, height: 8, type: 'wall' },
  { id: 'LEVEL2_RIGHT_WALL', x: 934, y: 412, width: 8, height: 188, type: 'wall' },
  { id: 'LEVEL2_RIGHT_FLOOR', x: 722, y: 594, width: 212, height: 8, type: 'solid' },
]

const collisionsLevel3 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 11; col++) grid[6][col] = 250
  return grid.flat()
})()

const collisionShapesLevel3 = [
  { id: 'LEVEL3_OUTER_CEILING', x: 54, y: 38, width: 914, height: 8, type: 'ceiling' },
  { id: 'LEVEL3_OUTER_LEFT_WALL', x: 48, y: 38, width: 8, height: 488, type: 'wall' },
  { id: 'LEVEL3_OUTER_RIGHT_WALL', x: 968, y: 38, width: 8, height: 322, type: 'wall' },
  { id: 'LEVEL3_OUTER_BOTTOM_LEFT', x: 56, y: 520, width: 456, height: 8, type: 'solid' },
  { id: 'LEVEL3_BOTTOM_STEP_WALL', x: 512, y: 420, width: 8, height: 108, type: 'wall' },
  { id: 'LEVEL3_BOTTOM_STEP_PLATFORM', x: 512, y: 420, width: 240, height: 8, type: 'solid' },
  { id: 'LEVEL3_RIGHT_STEP_WALL', x: 752, y: 360, width: 8, height: 68, type: 'wall' },
  { id: 'LEVEL3_RIGHT_STEP_PLATFORM', x: 752, y: 360, width: 216, height: 8, type: 'solid' },

  { id: 'LEVEL3_LEFT_PLATFORM', x: 82, y: 210, width: 256, height: 8, type: 'solid' },
  { id: 'LEVEL3_RAISED_PLATFORM', x: 300, y: 170, width: 216, height: 8, type: 'solid' },
  { id: 'LEVEL3_CENTER_PLATFORM', x: 404, y: 285, width: 218, height: 8, type: 'solid' },
]

const collisionsLevel4 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))

  const platforms = [[8, 9, 14]]
  platforms.forEach(([row, firstCol, lastCol]) => {
    for (let col = firstCol; col <= lastCol; col++) grid[row][col] = 292
  })

  return grid.flat()
})()

const collisionShapesLevel4 = [
  { id: 'LEVEL4_UPPER_CEILING', x: 54, y: 74, width: 398, height: 8, type: 'ceiling' },
  { id: 'LEVEL4_UPPER_LEFT_WALL', x: 48, y: 74, width: 8, height: 220, type: 'wall' },
  { id: 'LEVEL4_UPPER_RIGHT_WALL', x: 452, y: 74, width: 8, height: 146, type: 'wall' },
  { id: 'LEVEL4_UPPER_PLATFORM', x: 72, y: 290, width: 216, height: 8, type: 'solid' },
  { id: 'LEVEL4_FIRST_DROP_WALL', x: 288, y: 290, width: 8, height: 100, type: 'wall' },
  { id: 'LEVEL4_MIDDLE_PLATFORM', x: 220, y: 390, width: 240, height: 8, type: 'solid' },
  { id: 'LEVEL4_SECOND_DROP_WALL', x: 460, y: 390, width: 8, height: 110, type: 'wall' },
  { id: 'LEVEL4_TRANSITION_CEILING', x: 460, y: 210, width: 460, height: 8, type: 'ceiling' },
  { id: 'LEVEL4_TRANSITION_RIGHT_WALL', x: 920, y: 210, width: 8, height: 170, type: 'wall' },
  { id: 'LEVEL4_OFFICE_PLATFORM', x: 420, y: 500, width: 500, height: 8, type: 'solid' },
  { id: 'LEVEL4_SERVER_ROOM_CEILING', x: 920, y: 330, width: 390, height: 8, type: 'ceiling' },
  { id: 'LEVEL4_SERVER_ROOM_LEFT_WALL', x: 920, y: 500, width: 8, height: 200, type: 'wall' },
  { id: 'LEVEL4_SERVER_ROOM_RIGHT_WALL', x: 1310, y: 330, width: 8, height: 370, type: 'wall' },
  { id: 'LEVEL4_SERVER_ROOM_FLOOR', x: 920, y: 700, width: 390, height: 8, type: 'solid' },
]

const collisionsLevel5 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevel5 = [
  { id: 'LEVEL5_LEFT_OUTER_WALL', x: 70, y: 230, width: 8, height: 70, type: 'wall' },
  { id: 'LEVEL5_LEFT_PLATFORM', x: 15, y: 300, width: 285, height: 8, type: 'solid' },
  { id: 'LEVEL5_LEFT_DROP_WALL', x: 300, y: 300, width: 8, height: 110, type: 'wall' },
  { id: 'LEVEL5_MIDDLE_PLATFORM', x: 300, y: 410, width: 186, height: 8, type: 'solid' },
  { id: 'LEVEL5_MIDDLE_DROP_WALL', x: 486, y: 410, width: 8, height: 130, type: 'wall' },
  { id: 'LEVEL5_CENTER_FLOOR', x: 486, y: 540, width: 386, height: 8, type: 'solid' },
  { id: 'LEVEL5_CENTER_WALL', x: 450, y: 0, width: 8, height: 240, type: 'wall' },
  { id: 'LEVEL5_CENTER_CEILING', x: 450, y: 240, width: 484, height: 8, type: 'ceiling' },
  { id: 'LEVEL5_DOOR_PLATFORM', x: 1040, y: 362, width: 262, height: 8, type: 'solid' },
  { id: 'LEVEL5_LOWER_ROOM_LEFT_WALL', x: 872, y: 540, width: 8, height: 160, type: 'wall' },
  { id: 'LEVEL5_RIGHT_OUTER_WALL', x: 1302, y: 72, width: 8, height: 630, type: 'wall' },
  { id: 'LEVEL5_LOWER_ROOM_FLOOR', x: 872, y: 700, width: 430, height: 8, type: 'solid' },
]

const collisionsLevel6 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevel6 = [
  { id: 'LEVEL6_TOP_CEILING', x: 68, y: 64, width: 1240, height: 8, type: 'ceiling' },
  { id: 'LEVEL6_LEFT_UPPER_WALL', x: 68, y: 64, width: 8, height: 420, type: 'wall' },
  { id: 'LEVEL6_RIGHT_UPPER_WALL', x: 1300, y: 64, width: 8, height: 420, type: 'wall' },
  { id: 'LEVEL6_LEFT_ROAD', x: 0, y: 588, width: 782, height: 8, type: 'solid' },
  { id: 'LEVEL6_PIT_LEFT_WALL', x: 774, y: 588, width: 8, height: 78, type: 'wall' },
  { id: 'LEVEL6_PIT_FLOOR', x: 774, y: 660, width: 166, height: 8, type: 'solid' },
  { id: 'LEVEL6_PIT_RIGHT_WALL', x: 932, y: 588, width: 8, height: 78, type: 'wall' },
  { id: 'LEVEL6_RIGHT_ROAD', x: 932, y: 588, width: 444, height: 8, type: 'solid' },
]

const collisionsLevel6Left = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevel6Left = [
  { id: 'LEVEL6L_TOP_CEILING', x: 68, y: 64, width: 1240, height: 8, type: 'ceiling' },
  { id: 'LEVEL6L_LEFT_OUTER_WALL', x: 68, y: 64, width: 8, height: 552, type: 'wall' },
  { id: 'LEVEL6L_RIGHT_UPPER_WALL', x: 1300, y: 64, width: 8, height: 420, type: 'wall' },
  { id: 'LEVEL6L_ROAD_FLOOR', x: 0, y: 616, width: 1376, height: 8, type: 'solid' },
]

const collisionsLevel6Right = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevel6Right = [
  { id: 'LEVEL6R_TOP_CEILING', x: 68, y: 64, width: 1240, height: 8, type: 'ceiling' },
  { id: 'LEVEL6R_LEFT_UPPER_WALL', x: 68, y: 64, width: 8, height: 420, type: 'wall' },
  { id: 'LEVEL6R_RIGHT_OUTER_WALL', x: 1292, y: 64, width: 8, height: 552, type: 'wall' },
  { id: 'LEVEL6R_ROAD_FLOOR', x: 0, y: 616, width: 1376, height: 8, type: 'solid' },
]

const collisionsLevelHospital = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevelHospital = [
  { id: 'HOSP1_TOP_CEILING', x: 56, y: 56, width: 1256, height: 14, type: 'ceiling' },
  { id: 'HOSP1_LEFT_WALL', x: 52, y: 56, width: 14, height: 650, type: 'wall' },
  { id: 'HOSP1_RIGHT_WALL', x: 1296, y: 56, width: 14, height: 650, type: 'wall' },
  { id: 'HOSP1_GROUND_FLOOR', x: 56, y: 696, width: 1244, height: 18, type: 'solid' },
  { id: 'HOSP1_TOP_LEFT_FLOOR', x: 56, y: 204, width: 558, height: 16, type: 'solid' },
  { id: 'HOSP1_TRIAGE_BRICK_BLOCK', x: 450, y: 220, width: 164, height: 134, type: 'wall' },
  { id: 'HOSP1_TOP_RIGHT_LIP', x: 728, y: 214, width: 64, height: 12, type: 'oneWay' },
  { id: 'HOSP1_TOP_RIGHT_FLOOR', x: 792, y: 214, width: 508, height: 16, type: 'solid' },
  { id: 'HOSP1_RADIOLOGY_LIP', x: 734, y: 416, width: 58, height: 12, type: 'oneWay' },
  { id: 'HOSP1_RADIOLOGY_FLOOR', x: 792, y: 416, width: 328, height: 14, type: 'solid' },
  { id: 'HOSP1_TRIAGE_FLOOR', x: 56, y: 482, width: 552, height: 14, type: 'solid' },
  { id: 'HOSP1_TRIAGE_LIP', x: 608, y: 482, width: 44, height: 12, type: 'oneWay' },
  { id: 'HOSP1_TRIAGE_UNDER_BEAM', x: 207, y: 496, width: 297, height: 60, type: 'solid' },
  { id: 'HOSP1_MAINTENANCE_LIP', x: 734, y: 554, width: 58, height: 12, type: 'oneWay' },
  { id: 'HOSP1_MAINTENANCE_ROOF', x: 792, y: 554, width: 504, height: 14, type: 'solid' },
]

const collisionsLevelHospital2 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevelHospital2 = [
  { id: 'HOSP2_TOP_CEILING', x: 52, y: 58, width: 1260, height: 14, type: 'ceiling' },
  { id: 'HOSP2_LEFT_WALL', x: 48, y: 58, width: 14, height: 648, type: 'wall' },
  { id: 'HOSP2_RIGHT_WALL', x: 1300, y: 58, width: 14, height: 648, type: 'wall' },
  { id: 'HOSP2_GROUND_FLOOR', x: 52, y: 692, width: 1252, height: 18, type: 'solid' },
  { id: 'HOSP2_TOP_LEFT_FLOOR', x: 52, y: 234, width: 803, height: 24, type: 'solid' },
  { id: 'HOSP2_TOP_RIGHT_FLOOR', x: 945, y: 234, width: 356, height: 64, type: 'solid' },
  { id: 'HOSP2_RIGHT_UPPER_BLOCK', x: 1060, y: 298, width: 240, height: 102, type: 'solid' },
  { id: 'HOSP2_STORAGE_LINTEL', x: 1085, y: 400, width: 32, height: 46, type: 'solid' },
  { id: 'HOSP2_TRIAGE_FLOOR', x: 52, y: 500, width: 638, height: 16, type: 'solid' },
  { id: 'HOSP2_ICU_LEDGE', x: 785, y: 454, width: 145, height: 14, type: 'oneWay' },
  { id: 'HOSP2_MAINTENANCE_SHELF', x: 910, y: 576, width: 175, height: 16, type: 'oneWay' },
  { id: 'HOSP2_MAINTENANCE_CEILING', x: 930, y: 556, width: 155, height: 14, type: 'oneWay' },
]

const collisionsLevelCafe = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevelCafe = [
  { id: 'CAFE1_TOP_CEILING', x: 72, y: 66, width: 1230, height: 10, type: 'ceiling' },
  { id: 'CAFE1_LEFT_WALL', x: 64, y: 66, width: 12, height: 590, type: 'wall' },
  { id: 'CAFE1_RIGHT_WALL', x: 1296, y: 66, width: 12, height: 590, type: 'wall' },
  { id: 'CAFE1_GROUND_FLOOR', x: 72, y: 650, width: 1230, height: 14, type: 'solid' },
  { id: 'CAFE1_UPPER_CENTER_DIVIDER', x: 786, y: 66, width: 12, height: 215, type: 'wall' },
  { id: 'CAFE1_FLOOR3_LEFT', x: 72, y: 232, width: 508, height: 58, type: 'solid' },
  { id: 'CAFE1_LOBBY_FLOOR2', x: 72, y: 448, width: 520, height: 56, type: 'solid' },
  { id: 'CAFE1_ARCADE_FLOOR', x: 786, y: 448, width: 368, height: 56, type: 'solid' },
  { id: 'CAFE1_STAFF_LEDGE', x: 1125, y: 252, width: 175, height: 28, type: 'solid' },
  { id: 'CAFE1_RIGHT_SHAFT_PILLAR', x: 1148, y: 280, width: 148, height: 370, type: 'wall' },
]

const collisionsLevelCafe2 = (() => {
  const grid = Array.from({ length: 9 }, () => Array(16).fill(0))
  for (let col = 1; col <= 14; col++) grid[8][col] = 292
  return grid.flat()
})()

const collisionShapesLevelCafe2 = [
  { id: 'CAFE2_TOP_CEILING', x: 98, y: 64, width: 1184, height: 14, type: 'ceiling' },
  { id: 'CAFE2_LEFT_WALL', x: 96, y: 64, width: 16, height: 620, type: 'wall' },
  { id: 'CAFE2_RIGHT_WALL', x: 1268, y: 64, width: 16, height: 620, type: 'wall' },
  { id: 'CAFE2_GROUND_FLOOR', x: 98, y: 676, width: 1184, height: 16, type: 'solid' },
  { id: 'CAFE2_TOP_LEFT_CATWALK', x: 98, y: 204, width: 436, height: 28, type: 'solid' },
  { id: 'CAFE2_SERVER03_MID_SHELF', x: 345, y: 346, width: 210, height: 18, type: 'oneWay' },
  { id: 'CAFE2_SERVER03_FLOOR', x: 98, y: 492, width: 454, height: 48, type: 'solid' },
  { id: 'CAFE2_SERVER03_DROP', x: 515, y: 540, width: 40, height: 55, type: 'wall' },
  { id: 'CAFE2_TOP_RIGHT_CATWALK', x: 745, y: 204, width: 525, height: 28, type: 'solid' },
  { id: 'CAFE2_LOCKERS_FLOOR', x: 690, y: 416, width: 578, height: 42, type: 'solid' },
  { id: 'CAFE2_LOCKERS_RIGHT_WALL', x: 1105, y: 215, width: 20, height: 205, type: 'wall' },
  { id: 'CAFE2_LOWER_MID_PILLAR', x: 832, y: 455, width: 42, height: 115, type: 'wall' },
]

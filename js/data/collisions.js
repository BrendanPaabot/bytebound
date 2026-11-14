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

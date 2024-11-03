import kaplay, { GameObj, TileComp, Vec2 } from "kaplay";
import "kaplay/global";

kaplay({
  background: [74, 48, 82],
});

const TILE_SIZE = 64;

loadSprite("kat", "./sprites/kat.png");
loadSprite("ghost", "./sprites/ghosty.png");
loadSprite("wall", "./sprites/steel.png");
loadSprite("spike", "./sprites/spike.png");
loadSprite("exit", "./sprites/portal.png");
loadSprite("box", "./sprites/grass.png");

// Level and Tile components don't sync the level's spatialMap
// when using a tile's moveRight/move* methods. That means we
// cannot rely on level#getAt to fetch components from a level.
// Instead, use a custom component and manually create a
// spatial map (see: #createCMap in the game scene).
const coord = (cx: number, cy: number) => {
  return {
    id: "coord",
    requires: ["pos"],
    cx,
    cy,
    update() {
      this.pos.x = this.cx * TILE_SIZE;
      this.pos.y = this.cy * TILE_SIZE;
    },
    cmove(dir: Vec2) {
      this.cx += dir.x;
      this.cy += dir.y;
    },
  };
};

let currentLevel = 0;

interface Level {
  title: string;
  data: string[];
}

// prettier-ignore
const levels = [
  {
    title: "rebirth",
    data: [
      ".........",
      ".  x    .",
      ".  x   p.",
      ".  x    .",
      "........."
    ],
  },
  // tutorial: player must be ghost to exit
  {
    title: "pyramid",
    data: [
      ".........",
      ". b b bx.",
      ".  b b  .",
      ".   b  p.",
      "........."
    ]
  },
  // reinforce: player must be ghost to exit
  {
    title: "circle back",
    data: [
      ".........",
      ".  b b  .",
      ".xxb  bp.",
      ".      b.",
      "........."
    ]
  },
  // tutorial: player can spikefall
  {
    title: "spike trap",
    data: [
      ".........",
      ".  x b  .",
      ".  x b p.",
      ". bx b  .",
      "........."
    ]
  },
  {
    title: "sacrifice",
    data: [
      ".........",
      ".  bx   .",
      ".   bbbp.",
      ".  b xb .",
      "........."
    ]
  },
  {
    title: "tight spaces",
    data: [
      ".........",
      ".   .  p.",
      ".   b   .",
      ".....bbb.",
      ".xx     .",
      "........."
    ]
  }
];

// scene("debug", (n) => {
//   currentLevel = n;
//   go("game", levels[currentLevel].data);
// });
// go("debug", 5);

scene("selected", (level: Level) => {
  add([text(level.title), pos(center().add(0, -50)), anchor("center")]);
  add([text("press z"), pos(center().add(0, 50)), anchor("center")]);
  onKeyPress("z", () => {
    go("game", level.data);
  });
});

scene("menu", () => {
  let selectedLevel = 0;

  add([text("kajam2024"), pos(center().add(0, -50)), anchor("center")]);
  add([text("press z to start"), pos(center().add(0, 50)), anchor("center")]);
  add([
    text("wasd: move, z: undo, r: restart"),
    pos(center().add(0, 150)),
    anchor("center"),
  ]);

  onKeyPress("z", () => {
    go("selected", levels[selectedLevel]);
  });
});

type Action =
  | { kind: "move"; from: Vec2; dir: Vec2 }
  | { kind: "spikefall"; box: Vec2; spike: Vec2 }
  | { kind: "rebirth" };

scene("game", (levelData: string[]) => {
  const history = [];
  const level = addLevel(levelData, {
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    tiles: {
      k: ({ x, y }) => [sprite("kat"), coord(x, y), z(100), "kat"],
      ".": ({ x, y }) => [sprite("wall"), coord(x, y), "wall"],
      x: ({ x, y }) => [sprite("spike"), coord(x, y), "spike"],
      p: ({ x, y }) => [sprite("exit"), coord(x, y), "exit"],
      b: ({ x, y }) => [sprite("box"), coord(x, y), "box"],
    },
  });

  // Center that bad boy.
  level.pos = center();
  level.pos.x -= (level.numColumns() * TILE_SIZE) / 2;
  level.pos.y -= (level.numRows() * TILE_SIZE) / 2;

  const player = level.spawn("k", vec2(1, 1));

  const serialize = (x: number, y: number) => x + y * level.numColumns();

  const createCMap = () => {
    return level.get("coord").reduce((acc, cur) => {
      acc[serialize(cur.cx, cur.cy)] = cur;
      return acc;
    }, []);
  };

  const getC = (v: Vec2): GameObj | undefined => cmap[serialize(v.x, v.y)];

  let cmap = createCMap();
  const updateCMap = () => {
    cmap = createCMap();
  };

  const commitActions = (actions: Action[]) => {
    actions.forEach((action) => {
      if (action.kind === "move") {
        // action.obj.cmove(action.dir);
        const obj = getC(action.from);
        obj.cmove(action.dir);
      } else if (action.kind === "spikefall") {
        const box = getC(action.box);
        box.destroy();
        const spike = getC(action.spike);
        spike.destroy();
      } else if (action.kind === "rebirth") {
        player.unuse("sprite");
        player.unuse("kat");
        player.use(sprite("ghost"));
        player.use("ghost");
      }
    });

    updateCMap();
    history.push(actions);
  };

  const unwind = () => {
    if (history.length === 0) {
      return;
    }

    const recent: Action[] = history.pop();
    recent.reverse().forEach((action) => {
      if (action.kind === "move") {
        // action.obj.cmove(-action.dir.x, -action.dir.y);
        const obj = getC(action.from.add(action.dir));
        obj.cmove(vec2(-action.dir.x, -action.dir.y));
      } else if (action.kind === "spikefall") {
        level.spawn("b", action.box);
        level.spawn("x", action.spike);
      } else if (action.kind === "rebirth") {
        player.unuse("sprite");
        player.unuse("ghost");
        player.use(sprite("kat"));
        player.use("kat");
      }
    });

    updateCMap();
  };

  const move = (dirx: number, diry: number) => {
    const playerDestCoord = vec2(player.cx + dirx, player.cy + diry);
    const playerDest: GameObj | undefined = getC(playerDestCoord);
    const moves: Action[] = [];

    if (playerDest) {
      if (playerDest.is("exit") && player.is("ghost")) {
        currentLevel++;
        if (levels[currentLevel]) {
          go("selected", levels[currentLevel]);
        } else {
          go("win");
        }
        return;
      }

      if (playerDest.is("wall")) {
        return;
      }

      if (playerDest.is("spike") && player.is("kat")) {
        moves.push({ kind: "rebirth" });
      }

      if (player.is("ghost") && playerDest.is("box")) {
        return;
      }

      if (playerDest.is("box")) {
        const boxDestCoord = vec2(playerDest.cx + dirx, playerDest.cy + diry);
        const boxDest = getC(boxDestCoord);

        if (boxDest) {
          if (boxDest.is("wall") || boxDest.is("box") || boxDest.is("exit")) {
            return;
          }

          if (boxDest.is("spike")) {
            moves.push({
              kind: "spikefall",
              box: playerDestCoord,
              spike: boxDestCoord,
            });
          }
        } else {
          moves.push({
            kind: "move",
            from: playerDestCoord,
            dir: vec2(dirx, diry),
          });
        }
      }
    }

    moves.push({
      kind: "move",
      from: vec2(player.cx, player.cy),
      dir: vec2(dirx, diry),
    });
    commitActions(moves);
  };

  onKeyPress("d", () => {
    move(1, 0);
  });

  onKeyPress("a", () => {
    move(-1, 0);
  });

  onKeyPress("w", () => {
    move(0, -1);
  });

  onKeyPress("s", () => {
    move(0, 1);
  });

  onKeyPress("z", () => {
    unwind();
  });

  onKeyPress("r", () => {
    go("game", levels[currentLevel].data);
  });
});

scene("win", () => {
  add([
    text("Great job! All levels completed."),
    pos(center()),
    anchor("center"),
  ]);
});

go("menu");

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
    cvec: vec2(cx, cy),
    update() {
      this.pos.x = this.cvec.x * TILE_SIZE;
      this.pos.y = this.cvec.y * TILE_SIZE;
    },
    cmove(dir: Vec2) {
      this.cvec.x += dir.x;
      this.cvec.y += dir.y;
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
  }, 
  {
    title: "llama",
    data: [
      "........",
      ".  .. ..",
      ".  .. p.",
      ".  xb ..",
      ". bxb ..",
      ". bxb ..",
      "........"
    ]
  },
];

// scene("debug", (n) => {
//   currentLevel = n;
//   go("game", levels[currentLevel].data);
// });
// go("debug", 0);

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
  | { kind: "move"; from: Vec2; dir: Vec2; tag: string }
  | { kind: "spikefall"; box: Vec2; spike: Vec2 }
  | { kind: "rebirth" };

scene("game", (levelData: string[]) => {
  const history = [];
  const level = addLevel(levelData, {
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    tiles: {
      k: ({ x, y }) => [sprite("kat"), coord(x, y), z(100), "kat", "player"],
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

  const serialize = (v: Vec2) => v.x + v.y * level.numColumns();

  const createCMap = () => {
    return level.get("coord").reduce((acc, cur) => {
      acc[serialize(cur.cvec)] ||= [];
      acc[serialize(cur.cvec)].push(cur);
      return acc;
    }, []);
  };

  const find = (v: Vec2): GameObj[] => cmap[serialize(v)] || [];

  // There are only a few cases where we care that
  // there are multiple objs in a tile, e.g. player + spike.
  const findFirst = (v: Vec2, tag: string = undefined): GameObj | undefined => {
    const tiles = find(v);
    return tag ? tiles.find((t) => t.is(tag)) : tiles[0];
  };

  let cmap = createCMap();
  const updateCMap = () => {
    cmap = createCMap();
  };

  const commitActions = (actions: Action[]) => {
    actions.forEach((action) => {
      if (action.kind === "move") {
        const obj = findFirst(action.from, action.tag);
        obj.cmove(action.dir);
      } else if (action.kind === "spikefall") {
        const box = findFirst(action.box, "box");
        box.destroy();
        const spike = findFirst(action.spike, "spike");
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
        const obj = findFirst(action.from.add(action.dir), action.tag);
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

  const move = (dir: Vec2) => {
    const playerMoveTo = player.cvec.add(dir);
    const playerMoveToObj: GameObj | undefined = findFirst(playerMoveTo);
    const moves: Action[] = [];

    // Pulling blocks when a ghost.
    if (player.is("ghost")) {
      const opPlayerMoveTo = player.cvec.sub(dir);
      const opPlayerMoveToObj: GameObj | undefined = findFirst(opPlayerMoveTo);
      // Player and spike would occupy a single tile spot.
      const playerTiles = find(player.cvec);

      if (
        opPlayerMoveToObj?.is("box") &&
        playerTiles.find((tile) => tile.is("spike"))
      ) {
        moves.push({
          kind: "spikefall",
          box: opPlayerMoveTo,
          spike: player.cvec,
        });
      }

      if (
        (!playerMoveToObj || playerMoveToObj.is("spike")) &&
        opPlayerMoveToObj?.is("box")
      ) {
        moves.push({
          kind: "move",
          tag: "box",
          from: opPlayerMoveTo,
          dir,
        });
      }
    }

    // Pushing blocks when a kat.
    if (playerMoveToObj) {
      if (playerMoveToObj.is("exit") && player.is("ghost")) {
        currentLevel++;
        if (levels[currentLevel]) {
          go("selected", levels[currentLevel]);
        } else {
          go("win");
        }
        return;
      }

      if (playerMoveToObj.is("wall")) {
        return;
      }

      if (playerMoveToObj.is("spike") && player.is("kat")) {
        moves.push({ kind: "rebirth" });
      }

      if (player.is("ghost") && playerMoveToObj.is("box")) {
        return;
      }

      if (playerMoveToObj.is("box")) {
        const boxMoveTo = playerMoveTo.add(dir);
        const boxMoveToObj: GameObj | undefined = findFirst(boxMoveTo);

        if (boxMoveToObj) {
          if (
            boxMoveToObj.is("wall") ||
            boxMoveToObj.is("box") ||
            boxMoveToObj.is("exit")
          ) {
            return;
          }

          if (boxMoveToObj.is("spike")) {
            moves.push({
              kind: "spikefall",
              box: playerMoveTo,
              spike: boxMoveTo,
            });
          }
        } else {
          moves.push({
            kind: "move",
            tag: "box",
            from: playerMoveTo,
            dir,
          });
        }
      }
    }

    moves.push({
      kind: "move",
      tag: "player",
      from: player.cvec,
      dir,
    });
    commitActions(moves);
  };

  onKeyPress(["d", "right"], () => {
    move(vec2(1, 0));
  });

  onKeyPress(["a", "left"], () => {
    move(vec2(-1, 0));
  });

  onKeyPress(["w", "up"], () => {
    move(vec2(0, -1));
  });

  onKeyPress(["s", "down"], () => {
    move(vec2(0, 1));
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

import kaplay, { GameObj, TileComp, Vec2 } from "kaplay";
import "kaplay/global";
import { levels } from "./levels";

kaplay({
  background: [74, 48, 82],
});

const TILE_SIZE = 64;

loadSprite("kat", "./sprites/kat.png");
loadSprite("ghost", "./sprites/ghosty.png");
loadSprite("wall", "./sprites/steel.png");
loadSprite("spike", "./sprites/spike.png");
loadSprite("portalActive", "./sprites/portal.png");
loadSprite("portalInactive", "./sprites/portal-inactive.png");
loadSprite("box", "./sprites/grass.png");
loadSprite("lightning", "./sprites/lightening.png");

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

scene("selected", (level: Level) => {
  add([text(level.title), pos(center().add(0, -50)), anchor("center")]);
  add([text("press x"), pos(center().add(0, 50)), anchor("center")]);
  onKeyPress("x", () => {
    go("game", level.data);
  });
});

scene("menu", () => {
  let selectedLevel = 0;

  add([text("kat's ghost"), pos(center().add(0, -150)), anchor("center")]);
  add([text("press x to start"), pos(center().add(0, -100)), anchor("center")]);

  add([text("arrows/wasd: move"), pos(center()), anchor("center")]);
  add([text("z: undo"), pos(center().add(0, 50)), anchor("center")]);
  add([text("r: restart"), pos(center().add(0, 100)), anchor("center")]);

  onKeyPress("x", () => {
    go("selected", levels[selectedLevel]);
  });
});

type Action =
  | { kind: "move"; obj: GameObj; dir: Vec2; tag: string }
  | { kind: "rebirth" };

scene("game", (levelData: string[]) => {
  let portalsActive = false;
  const history = [];
  const level = addLevel(levelData, {
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    tiles: {
      k: ({ x, y }) => [sprite("kat"), coord(x, y), z(100), "kat", "player"],
      ".": ({ x, y }) => [sprite("wall"), coord(x, y), "wall"],
      x: ({ x, y }) => [sprite("spike"), coord(x, y), "spike"],
      p: ({ x, y }) => [sprite("portalInactive"), coord(x, y), "exit"],
      b: ({ x, y }) => [sprite("box"), coord(x, y), z(50), "box"],
      m: ({ x, y }) => [sprite("lightning"), coord(x, y), "lightning"],
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

  const getTiles = (v: Vec2): GameObj[] => cmap[serialize(v)] || [];

  const hasTag = (cmps: GameObj[], tag: string | string[]) =>
    cmps.findIndex((cmp) => {
      return typeof tag === "string" ? cmp.is(tag) : tag.some((t) => cmp.is(t));
    }) !== -1;

  let cmap: GameObj[][];
  const updateCMap = () => {
    cmap = createCMap();

    // TODO: technically need to check this before move since you can
    // theoretically simultaneously pull a block onto a lightning bolt
    // and move on to the portal. No levels use this though.
    // Not exactly the best place to put this, but hey, what can you do.
    const nextPortalsActive = cmap
      .filter((cmps) => cmps.find((cmp: GameObj) => cmp.is("lightning")))
      .every((cmps) => {
        return cmps.findIndex((cmp: GameObj) => cmp.is("box")) !== -1;
      });

    if (portalsActive !== nextPortalsActive) {
      const nextSprite = nextPortalsActive ? "portalActive" : "portalInactive";
      level.get("exit").forEach(exit => {
        exit.unuse("sprite");
        exit.use(sprite(nextSprite));
      })
    }

    portalsActive = nextPortalsActive;
  };
  // Run it once for good measure.
  updateCMap();

  const commitActions = (actions: Action[]) => {
    actions.forEach((action) => {
      if (action.kind === "move") {
        action.obj.cmove(action.dir);
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
        action.obj.cmove(vec2(0, 0).sub(action.dir));
      } else if (action.kind === "rebirth") {
        player.unuse("sprite");
        player.unuse("ghost");
        player.use(sprite("kat"));
        player.use("kat");
      }
    });

    updateCMap();
  };

  const advanceLevel = () => {
    currentLevel++;
    if (levels[currentLevel]) {
      go("selected", levels[currentLevel]);
    } else {
      go("win");
    }
  };

  const move = (dir: Vec2) => {
    const moves = [];
    const playerMoveTo = player.cvec.add(dir);
    const playerDestinationTiles = getTiles(playerMoveTo);

    if (hasTag(playerDestinationTiles, "wall")) {
      return;
    }

    if (player.is("ghost")) {
      // Win condition
      if (portalsActive && hasTag(playerDestinationTiles, "exit")) {
        advanceLevel();
        return;
      }

      // Ghost cannot push blocks.
      if (hasTag(playerDestinationTiles, "box")) {
        return;
      }

      // Pulling blocks
      const playerMoveAway = player.cvec.sub(dir);
      const playerMoveAwayTiles = getTiles(playerMoveAway);

      if (hasTag(playerMoveAwayTiles, "box")) {
        const box = playerMoveAwayTiles.find((cmp) => cmp.is("box"));
        const boxMoveTo = box.cvec.add(dir);
        const boxDestinationTiles = getTiles(boxMoveTo);

        // Occupant of the box destination will always be the player.
        // Player can pass through spikes, but a box cannot.
        if (!hasTag(boxDestinationTiles, "spike")) {
          moves.push({
            kind: "move",
            tag: "box",
            obj: box,
            dir,
          });
        }
      }
    } else if (player.is("kat")) {
      // Rebirth on spike
      if (hasTag(playerDestinationTiles, "spike")) {
        moves.push({ kind: "rebirth" });
      }

      // Pushing blocks
      if (hasTag(playerDestinationTiles, "box")) {
        const box = playerDestinationTiles.find((cmp) => cmp.is("box"));
        const boxMoveTo: Vec2 = box.cvec.add(dir);
        const boxDestinationTiles = getTiles(boxMoveTo);

        if (
          boxDestinationTiles.length === 0 ||
          (boxDestinationTiles.length === 1 &&
            hasTag(boxDestinationTiles, "lightning"))
        ) {
          moves.push({
            kind: "move",
            tag: "box",
            obj: box,
            dir,
          });
        } else {
          // Block player movement
          return;
        }
      }
    }

    moves.push({
      kind: "move",
      tag: "player",
      obj: player,
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

  add([
    text("Thanks for playing."),
    pos(center().add(vec2(0, 100))),
    anchor("center"),
  ]);
});

// scene("debug", (n = levels.length - 1) => {
//   currentLevel = n;
//   go("game", levels[currentLevel].data);
// });
// go("debug", 4);

go("menu");

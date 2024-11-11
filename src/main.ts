import kaplay, { GameObj, TileComp, Vec2 } from "kaplay";
import "kaplay/global";
import { levels } from "./levels";

const debugMode = false

// Palette credit:
// https://lospec.com/palette-list/pumpkin-patch-13
kaplay({
  background: [45, 33, 51],
  debug: debugMode,
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

let maxLevel = 0;

const advanceLevel = (current: number) => {
  if (current < maxLevel) {
    go("level-select", current);
  } else {
    const nextLevel = maxLevel + 1;
    if (levels[nextLevel]) {
      maxLevel = nextLevel;
      go("level-select", nextLevel);
    } else {
      go("win");
    }
  }
};

const centered = (offset: Vec2 = vec2(0)) => {
  let evt: any; // Looks like a TS bug in kaplay.

  return {
    id: "centered",
    requires: ["pos"],
    add() {
      this.pos = center().add(offset);

      evt = onResize(() => {
        this.pos = center().add(offset);
      });
    },
    destroy() {
      evt?.cancel();
    },
  };
};

scene("menu", () => {
  add([text("kat's ghost"), anchor("center"), centered(vec2(0, -50))]);
  add([text("press x to start"), anchor("center"), centered(vec2(0, 50))]);

  onKeyPress("x", () => {
    go("level-select");
  });
});

type Action =
  | { kind: "move"; obj: GameObj; dir: Vec2; tag: string }
  | { kind: "rebirth" };

scene("game", (current: number) => {
  let portalsActive = false;

  const levelData = levels[current].data;
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

  // Lazy fix for some text overlap
  if (current <= 5) {
    add([
      text("z: undo, r: reset"),
      pos(vec2(center().x, height() - 30)),
      anchor("center"),
    ]);
  }

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
      level.get("exit").forEach((exit) => {
        exit.unuse("sprite");
        exit.use(sprite(nextSprite));
      });
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
        advanceLevel(current);
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
        if (!hasTag(boxDestinationTiles, ["spike", "exit"])) {
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
    go("game", current);
  });

  onKeyPress("escape", () => {
    go("level-select", current);
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

  onKeyPress("escape", () => {
    go("level-select");
  });
});

scene("level-select", (initialSelected = 0) => {
  let selected = initialSelected;

  const completedColor = Color.fromHex("14532e");
  const unavailableColor = Color.fromHex("9e4228");
  const selectedColor = Color.fromHex("6baa9a");
  const nextColor = Color.fromHex("7f0f28");

  const rowLength = 5;
  const tileSize = 48;
  const spacing = 32;

  const menuitem = (idx: number) => {
    return {
      id: "menuitem",
      requires: ["color"],
      idx,
      selected: false,
    };
  };

  const titlePreview = add([
    text(levels[selected].title),
    pos(center().sub(0, height() / 4)),
    anchor("center"),
  ]);

  const updateSelected = () => {
    titlePreview.text = levels[selected].title + " (x)";

    get("menuitem").forEach((cmp) => {
      if (cmp.idx === selected) {
        cmp.color = selectedColor;
      } else if (cmp.idx < maxLevel) {
        cmp.color = completedColor;
      } else if (cmp.idx === maxLevel) {
        cmp.color = nextColor;
      } else {
        cmp.color = unavailableColor;
      }
    });
  };

  const createTile = (i: number, { x, y }: Vec2) =>
    add([pos(x, y), rect(tileSize, tileSize, { fill: true }), menuitem(i)]);

  const totalWidth = rowLength * (tileSize + spacing);

  levels.forEach((_, i) => {
    const row = i % rowLength;
    const col = Math.floor(i / rowLength);
    const offset = (row / rowLength) * totalWidth - totalWidth / 2;
    const pos = center().add(offset, col * (spacing + tileSize) - 50);

    createTile(i, pos);
  });

  updateSelected();

  onKeyPress(["left", "a"], () => {
    selected -= 1;
    if (selected < 0) {
      selected = 0;
    }
    updateSelected();
  });

  onKeyPress(["tab", "right", "d"], () => {
    selected = Math.min(selected + 1, debug ? levels.length - 1 : maxLevel);
    updateSelected();
  });

  onKeyPress(["x", "enter"], () => {
    go("game", selected);
  });
});

go("menu");

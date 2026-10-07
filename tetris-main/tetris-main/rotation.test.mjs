import assert from "node:assert/strict";
import fs from "fs";
import test from "node:test";
import vm from "vm";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function extractBlock(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`missing ${signature}`);
  let i = source.indexOf("{", start);
  let depth = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${signature}`);
}

const sandbox = {
  COLS: 10,
  ROWS: 20,
  DEPTH: 3,
  state: {},
  updateHud() {}
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractBlock(html, "function cube("),
    extractBlock(html, "const SHAPES = {"),
    extractBlock(html, "function cloneCells("),
    extractBlock(html, "function cloneShape("),
    extractBlock(html, "function bounds("),
    extractBlock(html, "function normalizeCells("),
    extractBlock(html, "function rotateCells("),
    extractBlock(html, "function rotatedPiece("),
    extractBlock(html, "function spawnPiece("),
    extractBlock(html, "function collides("),
    extractBlock(html, "function ghostY("),
    extractBlock(html, "function tryRotate("),
    "this.SHAPES = SHAPES; this.cloneShape = cloneShape; this.bounds = bounds;",
    "this.normalizeCells = normalizeCells; this.rotateCells = rotateCells;",
    "this.spawnPiece = spawnPiece; this.collides = collides; this.ghostY = ghostY; this.tryRotate = tryRotate;"
  ].join("\n"),
  sandbox
);

const { SHAPES, cloneShape, bounds, normalizeCells, rotateCells, spawnPiece, collides, ghostY, tryRotate } = sandbox;

function createBoard() {
  return Array.from({ length: sandbox.DEPTH }, () =>
    Array.from({ length: sandbox.ROWS }, () => Array(sandbox.COLS).fill(null))
  );
}

function freshState() {
  sandbox.state = {
    board: createBoard(),
    current: null,
    gameOver: false,
    paused: false,
    clearing: null
  };
  return sandbox.state;
}

function piece(type, x = 3, y = 0, z = 1) {
  return { type, cells: cloneShape(type), x, y, z };
}

function cells(p) {
  return p.cells.map((c) => [p.x + c.x, p.y + c.y, p.z + c.z]);
}

function key(cells3) {
  return JSON.stringify(cells3.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]));
}

function assertInside(p) {
  const found = cells(p);
  assert.equal(found.length, 4);
  assert.equal(new Set(found.map(String)).size, 4, "two cubes share one (x, y, z)");
  for (const [x, y, z] of found) {
    assert.ok(x >= 0 && x < sandbox.COLS, `x ${x} out of well`);
    assert.ok(y >= 0 && y < sandbox.ROWS, `y ${y} out of well`);
    assert.ok(z >= 0 && z < sandbox.DEPTH, `z ${z} out of well`);
    assert.equal(sandbox.state.board[z][y][x], null);
  }
}

function dropToFloor(p) {
  sandbox.state.current = p;
  p.y = ghostY(p);
  return p;
}

test("every shape is four distinct cubes normalized to a zero origin", () => {
  for (const [type, shape] of Object.entries(SHAPES)) {
    assert.equal(shape.length, 4, type);
    assert.equal(new Set(shape.map((c) => `${c.x},${c.y},${c.z}`)).size, 4, type);
    const b = bounds(shape);
    assert.deepEqual([b.minX, b.minY, b.minZ], [0, 0, 0], type);
  }
});

test("B, R and Q really span two z layers", () => {
  for (const type of ["B", "R", "Q"]) {
    const b = bounds(SHAPES[type]);
    assert.equal(b.d, 2, type);
  }
  for (const type of ["I", "J", "L", "O", "S", "T", "Z"]) {
    assert.equal(bounds(SHAPES[type]).d, 1, type);
  }
});

test("rotation formulas follow the documented axis maps", () => {
  const flat = (c) => [c.x, c.y, c.z];
  assert.deepEqual(flat(rotateCells([{ x: 1, y: 2, z: 3 }], "z", 1)[0]), [-2, 1, 3]);
  assert.deepEqual(flat(rotateCells([{ x: 1, y: 2, z: 3 }], "x", 1)[0]), [1, -3, 2]);
  assert.deepEqual(flat(rotateCells([{ x: 1, y: 2, z: 3 }], "y", 1)[0]), [3, 2, -1]);
  for (const axis of ["x", "y", "z"]) {
    const fwd = normalizeCells(rotateCells(SHAPES.B, axis, 1));
    const back = normalizeCells(rotateCells(fwd, axis, -1));
    assert.equal(key(back.map((p) => [p.x, p.y, p.z])), key(SHAPES.B.map((p) => [p.x, p.y, p.z])), axis);
  }
});

test("four quarter turns about any axis return the polycube to its start", () => {
  for (const type of Object.keys(SHAPES)) {
    for (const axis of ["x", "y", "z"]) {
      let cur = cloneShape(type);
      for (let i = 0; i < 4; i += 1) cur = normalizeCells(rotateCells(cur, axis, 1));
      assert.equal(key(cur.map((p) => [p.x, p.y, p.z])), key(SHAPES[type].map((p) => [p.x, p.y, p.z])), `${type}/${axis}`);
    }
  }
});

test("collision is checked per cube on every axis", () => {
  const state = freshState();
  const p = piece("B", 4, 10, 0); // cubes at z=0 and one at z=1
  assert.equal(collides(p.cells, p.x, p.y, p.z), false);
  state.board[1][10][4] = "X"; // blocks only the z=1 cube
  assert.equal(collides(p.cells, p.x, p.y, p.z), true);
  state.board[1][10][4] = null;
  state.board[2][10][4] = "X"; // different layer: no contact
  assert.equal(collides(p.cells, p.x, p.y, p.z), false);
  assert.equal(collides(p.cells, p.x, p.y, 2), true, "z + 1 leaves the well");
  assert.equal(collides(p.cells, p.x, p.y, -1), true);
  assert.equal(collides(p.cells, -1, p.y, p.z), true);
  assert.equal(collides(p.cells, sandbox.COLS - 1, p.y, p.z), true);
  assert.equal(collides(p.cells, p.x, sandbox.ROWS - 1, p.z), true);
  assert.equal(collides(p.cells, p.x, -1, p.z), false, "spawn zone above the well is allowed");
});

test("spawn centers the piece on x and z", () => {
  const b = spawnPiece("B");
  assert.equal(b.z, 0);
  assert.equal(bounds(b.cells).d, 2);
  const i = spawnPiece("I");
  assert.equal(i.x, 3);
  assert.equal(i.z, 1);
});

test("a flat I resting on the floor can rotate about z and still stand in the well", () => {
  for (const direction of [1, -1]) {
    freshState();
    const p = dropToFloor(piece("I"));
    const before = key(cells(p));
    assert.equal(tryRotate("z", direction), true);
    assert.notEqual(key(cells(p)), before);
    assertInside(p);
    assert.equal(bounds(p.cells).h, 4);
    assert.equal(Math.max(...cells(p).map((cell) => cell[1])), sandbox.ROWS - 1);
  }
});

test("J, L, S, T, and Z can still rotate on the floor without a two-row jump", () => {
  for (const type of ["J", "L", "S", "T", "Z"]) {
    freshState();
    const p = dropToFloor(piece(type));
    const landed = p.y;
    assert.equal(tryRotate("z", 1), true, type);
    assert.equal(p.y, landed - 1, type);
    assertInside(p);
  }
});

test("T does not kick upward by two rows when one row is not enough", () => {
  const state = freshState();
  const p = dropToFloor(piece("T"));
  const landed = p.y;
  const snapshot = key(cells(p));
  state.board[p.z][landed - 1].fill("X");
  assert.equal(tryRotate("z", 1), false);
  assert.equal(p.y, landed);
  assert.equal(key(cells(p)), snapshot);
});

test("z-axis rotation never hops to another layer to escape a blocked row", () => {
  const state = freshState();
  const p = dropToFloor(piece("I"));
  const snapshot = key(cells(p));
  state.board[p.z][p.y - 2].fill("X");
  assert.equal(tryRotate("z", 1), false);
  assert.equal(p.z, 1);
  assert.equal(key(cells(p)), snapshot);
});

test("a flat I cannot spin into a well that is only three deep", () => {
  freshState();
  const p = dropToFloor(piece("I"));
  const snapshot = key(cells(p));
  assert.equal(tryRotate("y", 1), false);
  assert.equal(key(cells(p)), snapshot);
});

test("tilting an I about its own axis is a no-op that still succeeds", () => {
  freshState();
  const p = dropToFloor(piece("I"));
  const snapshot = key(cells(p));
  assert.equal(tryRotate("x", 1), true);
  assert.equal(key(cells(p)), snapshot);
});

test("a vertical I can tilt about x to lie along z once there is room", () => {
  freshState();
  const p = piece("I", 4, 2, 1);
  sandbox.state.current = p;
  assert.equal(tryRotate("z", 1), true); // stand it up (height 4)
  assert.equal(bounds(p.cells).h, 4);
  assert.equal(tryRotate("x", 1), false, "4 deep does not fit in DEPTH 3");
  assert.equal(bounds(p.cells).h, 4, "piece is left untouched when the turn fails");
});

test("spinning a tripod about y moves cubes between z layers in the game data", () => {
  freshState();
  const p = piece("B", 4, 5, 0);
  sandbox.state.current = p;
  const before = cells(p);
  assert.equal(before.filter((c) => c[2] === 1).length, 1);
  assert.equal(tryRotate("y", 1), true);
  assertInside(p);
  const after = cells(p);
  assert.notEqual(key(after), key(before));
  assert.equal(new Set(after.map((c) => c[2])).size, 2, "still occupies two layers");
});

test("tilting about x uses a z kick when the front wall is in the way", () => {
  freshState();
  const p = piece("B", 4, 5, 1); // z=1 and z=2 — already touching the front wall
  sandbox.state.current = p;
  assert.equal(tryRotate("x", 1), true);
  assertInside(p);
});

<script lang="ts">
  import {
    callAPI,
    getMediaUrl,
    type APICellTexture,
    type APIDecoration,
    type APILevelData,
  } from "$lib/api";
  import Controller, {
    type GameMouseMoveEvent,
    type GameMousePressEvent,
    type GameMouseReleaseEvent,
    type GameMouseScrollEvent,
    MouseButton,
  } from "$lib/controller";
  import { Cartesian, degToRad } from "$lib/point";
  import Rectangle from "$lib/rectangle";
  import Renderer from "$lib/renderer";
  import { OrthographicCamera, type Camera } from "$lib/renderer/camera";
  import Texture from "$lib/renderer/texture";
  import * as GLM from "gl-matrix";
  import { onMount } from "svelte";
  import { type PageProps } from "./$types";
  import { addToast } from "$lib/components/Toaster.svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import assert from "$lib/assert";
  import "@google/model-viewer";
  import DynamicGLTF from "$lib/renderer/gltf/dynamic";
  import type InstanceGLTF from "$lib/renderer/gltf/instance";
  import StyledButton from "$lib/components/StyledButton.svelte";
  import StyledInput from "$lib/components/StyledInput.svelte";
  import ModelViewer from "$lib/components/ModelViewer.svelte";

  const GRID_WIDTH = 256;
  const GRID_HEIGHT = 256;

  let { data }: PageProps = $props();

  let canvas = $state<HTMLCanvasElement>();
  let levelId = $derived<string>(data.level.id);
  let levelName = $derived<string>(data.level.name ?? "");
  let selectedTexture = $state<string | null>(null);
  let selectedDecoration = $state<string | null>(null);
  let loading = $state(true);
  let controller: Controller;
  let renderer: Renderer;
  let camera: Camera;
  let levelData: APILevelData;
  let frameHandle = -1;
  let input: { type: "none" } | { type: "dragging"; button: number } = { type: "none" };
  let dragStartCoord: Cartesian | null = null;
  let dragCurrentCoord: Cartesian | null = null;
  let rectId: number;
  const decorationModelLookup: Record<string, number> = {};
  const decorationInstanceByCell: Record<number, InstanceGLTF> = {};
  let lastPlacedDecoration: { cell: Cartesian; instance: InstanceGLTF } | null = null;

  onMount(() => {
    controller = new Controller(canvas!);
    renderer = new Renderer(canvas!, {
      resizeToWindow: true,
      backgroundColor: new Float32Array([0, 0, 0, 1]),
    });
    camera = new OrthographicCamera(canvas!.width / canvas!.height); // TODO: handle resizing window
    camera.zoom = 100;
    levelData = data.level.data
      ? data.level.data
      : {
          version: 1,
          textures: [],
          decorations: [],
          grid: Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_HEIGHT).fill(null)),
        };

    rectId = renderer.createElement(Rectangle);

    renderer.loadTexture("system.plain", new Texture(1, 1));

    const textureMediaLookup = data.cellTextures.reduce<Record<string, string>>((prev, curr) => {
      return { ...prev, [curr.key]: curr.mediaId };
    }, {});
    const decorationMediaLookup = data.decorations.reduce<Record<string, string>>((prev, curr) => {
      return { ...prev, [curr.key]: curr.mediaId };
    }, {});

    // load textures, then decorations to avoid melding
    Promise.all(
      levelData.textures.map((texture) => {
        const uri = getMediaUrl(textureMediaLookup[texture]);
        return renderer.loadTexture(texture, uri, {
          mode: "nearest",
        });
      }),
    ).then(() =>
      Promise.all(
        levelData.decorations.map(async (decoration) => {
          const res = await callAPI(
            fetch,
            "GET",
            "/media/" + decorationMediaLookup[decoration] + "/content",
          );

          if (!res.ok) {
            assert(false, "load media failed");
            return;
          }

          const src = await res.data.json();
          const modelId = await renderer.createDynamicGLTFElement(src); // TODO: use static gltf
          decorationModelLookup[decoration] = modelId;
        }),
      ).then(() => {
        for (let row = 0; row < levelData.grid.length; row++) {
          for (let col = 0; col < levelData.grid[row].length; col++) {
            const cell = levelData.grid[row][col];
            if (!cell || cell.decoration.index < 0) {
              continue;
            }

            createDecorationInstance(
              levelData.decorations[cell.decoration.index],
              col,
              row,
              cell.decoration.rotation,
            );
          }
        }
        loading = false;
      }),
    );

    loop();

    return () => {
      window.cancelAnimationFrame(frameHandle);
    };
  });

  function tick() {
    if (!controller) {
      return;
    }
    for (const event of controller.getMouseEvents()) {
      switch (event.type) {
        case "clear": {
          handleClear();
          break;
        }
        case "press": {
          handlePress(event);
          break;
        }
        case "release": {
          handleRelease(event);
          break;
        }
        case "move": {
          handleMove(event);
          break;
        }
        case "scroll": {
          handleScroll(event);
          break;
        }
      }
    }
  }

  function draw() {
    if (!renderer || !levelData || loading) {
      return;
    }

    renderer.clear();

    const cellsByTexture: Record<number, Cartesian[]> = {};
    for (let row = 0; row < levelData.grid.length; row++) {
      for (let col = 0; col < levelData.grid[row].length; col++) {
        const cell = levelData.grid[row][col];
        if (!cell) {
          continue;
        }

        const texture = cell.texture;
        if (texture === undefined || texture === null || texture < 0) {
          continue;
        }

        const point = new Cartesian(col, row);
        if (cellsByTexture[texture] === undefined) {
          cellsByTexture[texture] = [point];
          continue;
        }

        cellsByTexture[texture].push(point);
      }
    }

    const rect = renderer.getAndUseElement<Rectangle>(rectId);
    rect.setCamera(camera);
    for (const [textureIndex, coords] of Object.entries(cellsByTexture)) {
      renderer.useTexture(levelData.textures[Number(textureIndex)]);
      const buffer = rect.allocate(coords.length);
      for (let i = 0; i < coords.length; i++) {
        const offset = i * rect.instanceSize;
        const model = GLM.mat4.create();
        const coord = coords[i];
        GLM.mat4.translate(model, model, GLM.vec3.fromValues(coord.x, coord.y, 0));
        buffer.set(model, offset);
        buffer.set(new Float32Array([1, 1, 1, 1]), offset + model.length);
      }
      rect.draw();
    }

    // draw grid lines
    renderer.useTexture("system.plain");
    const buffer = rect.allocate(GRID_HEIGHT / 2 + GRID_WIDTH / 2);
    let offset = 0;
    for (let row = 0; row < GRID_HEIGHT; row += 2) {
      const model = GLM.mat4.create();
      GLM.mat4.translate(model, model, GLM.vec3.fromValues(GRID_WIDTH / 2, row + 0.5, 1));
      GLM.mat4.scale(model, model, GLM.vec3.fromValues(GRID_WIDTH, 0.1, 1));
      buffer.set(model, offset);
      buffer.set(new Float32Array([1, 1, 1, 0.2]), offset + model.length);
      offset += rect.instanceSize;
    }
    for (let col = 0; col < GRID_WIDTH; col += 2) {
      const model = GLM.mat4.create();
      GLM.mat4.translate(model, model, GLM.vec3.fromValues(col + 0.5, GRID_HEIGHT / 2, 1));
      GLM.mat4.scale(model, model, GLM.vec3.fromValues(0.1, GRID_HEIGHT, 1));
      buffer.set(model, offset);
      buffer.set(new Float32Array([1, 1, 1, 0.2]), offset + model.length);
      offset += rect.instanceSize;
    }
    rect.draw();

    // drag indicator
    if (input.type === "dragging" && dragStartCoord && dragCurrentCoord) {
      const minY = Math.min(dragStartCoord.y, dragCurrentCoord.y);
      const maxY = Math.max(dragStartCoord.y, dragCurrentCoord.y);
      const minX = Math.min(dragStartCoord.x, dragCurrentCoord.x);
      const maxX = Math.max(dragStartCoord.x, dragCurrentCoord.x);

      const cells = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          cells.push(new Cartesian(x, y));
        }
      }

      if (cells.length >= 1) {
        const buffer = rect.allocate(cells.length);
        for (let i = 0; i < cells.length; i++) {
          const model = GLM.mat4.create();
          GLM.mat4.translate(model, model, GLM.vec3.fromValues(cells[i].x, cells[i].y, 2));
          const offset = i * rect.instanceSize;
          buffer.set(model, offset);
          buffer.set(
            input.button === MouseButton.Left
              ? new Float32Array([0, 1, 1, 0.4])
              : new Float32Array([1, 0, 0, 0.4]),
            offset + model.length,
          );
        }
        rect.draw();
      }
    }

    // draw the decorations
    for (const decoration of levelData.decorations) {
      const model = renderer.getAndUseElement<DynamicGLTF>(decorationModelLookup[decoration]);
      model.setCamera(camera);
      model.draw();
    }
  }

  function handleClear() {
    input = { type: "none" };
  }

  function handlePress(event: GameMousePressEvent) {
    if (selectedDecoration && event.button !== MouseButton.Middle) {
      if (event.button === MouseButton.Left) {
        if (!levelData.decorations.includes(selectedDecoration)) {
          levelData.decorations.push(selectedDecoration);
        }

        const decorationIndex = levelData.decorations.findIndex(
          (decoration) => decoration === selectedDecoration,
        );
        assert(decorationIndex !== -1, "Failed to insert and find decoration");

        const coord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y).round();
        if (
          coord.x < 0 ||
          coord.x >= GRID_WIDTH ||
          coord.y < 0 ||
          coord.y >= GRID_HEIGHT ||
          levelData.grid[coord.y][coord.x]?.decoration?.index === decorationIndex
        ) {
          return;
        }

        const cell = levelData.grid[coord.y][coord.x];
        levelData.grid[coord.y][coord.x] = {
          decoration: {
            index: decorationIndex,
            rotation: 0,
          },
          texture: cell ? cell.texture : -1,
        };

        lastPlacedDecoration = {
          cell: coord,
          instance: createDecorationInstance(selectedDecoration, coord.x, coord.y, 0),
        };
      } else if (event.button === MouseButton.Right) {
        if (lastPlacedDecoration) {
          // TODO: Save transformation data with decorations
          GLM.mat4.rotateY(
            lastPlacedDecoration.instance.transform,
            lastPlacedDecoration.instance.transform,
            degToRad(45),
          );
          const cell = levelData.grid[lastPlacedDecoration.cell.y][lastPlacedDecoration.cell.x];
          assert(!!cell, "last placed decoration's cell doesn't exist.");
          cell!.decoration.rotation += 45;
          levelData.grid[lastPlacedDecoration.cell.y][lastPlacedDecoration.cell.x] = {
            decoration: cell!.decoration,
            texture: cell!.texture,
          };
        }
      }
    } else {
      input = { type: "dragging", button: event.button };
      dragStartCoord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y).round();
    }
  }

  function handleRelease(event: GameMouseReleaseEvent) {
    if (input.type === "dragging") {
      input = { type: "none" };
      if (dragStartCoord !== null && dragCurrentCoord !== null) {
        const minY = Math.min(dragStartCoord.y, dragCurrentCoord.y);
        const maxY = Math.max(dragStartCoord.y, dragCurrentCoord.y);
        const minX = Math.min(dragStartCoord.x, dragCurrentCoord.x);
        const maxX = Math.max(dragStartCoord.x, dragCurrentCoord.x);
        if (event.button === MouseButton.Left && selectedTexture) {
          // paint
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
                continue;
              }
              if (!levelData.textures.includes(selectedTexture)) {
                levelData.textures.push(selectedTexture);
              }
              const textureIndex = levelData.textures.findIndex(
                (texture) => texture === selectedTexture,
              );
              assert(textureIndex !== -1, "Failed to insert and find texture");
              const cell = levelData.grid[y][x];
              levelData.grid[y][x] = {
                texture: textureIndex,
                decoration: {
                  index: cell ? cell.decoration.index : -1,
                  rotation: cell ? cell.decoration.rotation : 0,
                },
              };
            }
          }
        } else if (event.button === MouseButton.Right) {
          // erase
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
                continue;
              }
              deleteDecorationInstance(x, y);
              levelData.grid[y][x] = null;
            }
          }
        }
      }
      dragStartCoord = null;
      dragCurrentCoord = null;
    }
  }

  function handleMove(event: GameMouseMoveEvent) {
    if (input.type === "dragging") {
      if (input.button === MouseButton.Middle) {
        const end = renderer.canvasCoordToWorldCoord(camera, event.x, event.y);
        const start = renderer.canvasCoordToWorldCoord(
          camera,
          event.x - event.deltaX,
          event.y - event.deltaY,
        );
        const delta = start.subtract(end);

        camera?.translate(GLM.vec3.fromValues(-delta.x, delta.y, 0));
      } else if (input.button === MouseButton.Left || input.button === MouseButton.Right) {
        dragCurrentCoord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y).round();
      }
    }
  }

  function handleScroll(event: GameMouseScrollEvent) {
    camera!.zoom = Math.max(1, camera!.zoom + event.delta / 25);
  }

  async function handleLoadTexture(texture: APICellTexture) {
    try {
      await renderer.loadTexture(texture.key, getMediaUrl(texture.mediaId), { mode: "nearest" });
    } catch (e) {
      if (e instanceof Error && e.message.includes("already in use")) {
        return;
      }

      assert(false, "failed to load texture");
    }
  }

  async function handleLoadDecoration(decoration: APIDecoration) {
    if (levelData.decorations.includes(decoration.key)) {
      return;
    }

    const res = await callAPI(fetch, "GET", "/media/" + decoration.mediaId + "/content");

    if (!res.ok) {
      assert(false, "load media failed");
      return;
    }

    const src = await res.data.json();
    const modelId = await renderer.createDynamicGLTFElement(src); // TODO: use static gltf
    decorationModelLookup[decoration.key] = modelId;
    levelData.decorations.push(decoration.key);
  }

  function getCellKey(x: number, y: number): number {
    return y * GRID_WIDTH + x;
  }

  function createDecorationInstance(
    key: string,
    x: number,
    y: number,
    rotation: number,
  ): InstanceGLTF {
    const model = renderer.getElement<DynamicGLTF>(decorationModelLookup[key]);
    const instance = model.createInstance();
    const transform = GLM.mat4.create();
    GLM.mat4.translate(transform, transform, GLM.vec3.fromValues(x, y, 0.1));
    GLM.mat4.rotateX(transform, transform, degToRad(90));
    GLM.mat4.rotateY(transform, transform, degToRad(rotation));
    instance.transform = transform;
    instance.updateTransforms();
    instance.computeSkinningMatrix();
    decorationInstanceByCell[getCellKey(x, y)] = instance;
    return instance;
  }

  function deleteDecorationInstance(x: number, y: number) {
    const key = getCellKey(x, y);
    const instance = decorationInstanceByCell[key];
    if (!instance) {
      return;
    }

    instance.model.deleteInstance(instance);
    delete decorationInstanceByCell[key];
    if (lastPlacedDecoration?.instance === instance) {
      lastPlacedDecoration = null;
    }
  }

  async function handleSaveLevel(event: SubmitEvent) {
    event.preventDefault();

    const body = JSON.stringify({ name: levelName, level: levelData });
    const res = await callAPI(fetch, "PUT", "/levels/" + levelId, { body });
    if (!res.ok) {
      addToast({
        data: { title: "Failed To Save Level", description: res.error.message, level: "danger" },
      });
      return;
    }

    addToast({
      data: { title: "Saved.", description: "Level saved successfully.", level: "success" },
    });
  }

  function loop() {
    frameHandle = window.requestAnimationFrame(() => {
      tick();
      draw();
      loop();
    });
  }
</script>

<main class="relative grid justify-start">
  <canvas class="absolute inset-0 bg-white" bind:this={canvas}></canvas>
  <div
    class="relative z-10 grid justify-start gap-4 top-4 left-4 bg-aurora-gray-1400 border-2 border-aurora-gray-1200 p-4 rounded"
  >
    <div class="flex flex-col gap-3 max-w-64 md:max-w-full">
      <StyledButton onclick={() => goto(resolve("/dashboard"))} label="Exit" class="w-min px-4" />
      <form onsubmit={handleSaveLevel} class="flex gap-2">
        <StyledInput type="text" placeholder="Level Name" bind:value={levelName} />
        <StyledButton label="Save" class="w.min px-4" />
      </form>
    </div>

    <div class="grid gap-2">
      <h2 class="text-center">Textures</h2>
      <ul class="grid grid-cols-3 justify-center">
        {#each data.cellTextures as cellTexture, i (i)}
          <li class="grid justify-center">
            <button
              data-selected={cellTexture.key === selectedTexture}
              class="data-[selected=true]:text-blue-500 group"
              onclick={() => {
                selectedDecoration = null;
                handleLoadTexture(cellTexture).then(() => {
                  selectedTexture = cellTexture.key;
                });
              }}
            >
              <img
                alt={cellTexture.displayName}
                src={getMediaUrl(cellTexture.mediaId)}
                width={64}
                height={64}
                class="texture border-2 border-gray-800 group-data-[selected=true]:border-gray-200 hover:border-aurora-gray-200 rounded"
              />
            </button>
          </li>
        {/each}
      </ul>
    </div>

    <div class="grid gap-2">
      <h2 class="text-center">Decorations</h2>
      <ul class="grid grid-cols-3">
        {#each data.decorations as decoration, i (i)}
          <li class="grid justify-center">
            <button
              data-selected={decoration.key === selectedDecoration}
              class="group"
              onclick={() => {
                if (selectedDecoration === decoration.key) {
                  selectedDecoration = null;
                } else {
                  loading = true;
                  selectedTexture = null;

                  handleLoadDecoration(decoration).then(() => {
                    loading = false;
                    selectedDecoration = decoration.key;
                  });
                }
              }}
            >
              <span class="sr-only">{decoration.displayName}</span>
              <ModelViewer
                autoRotate={true}
                mediaId={decoration.mediaId}
                class="size-16 border-2 border-gray-800 group-data-[selected=true]:border-gray-200 hover:border-aurora-gray-200 rounded"
              />
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</main>

<style>
  .texture {
    image-rendering: pixelated;
  }
</style>

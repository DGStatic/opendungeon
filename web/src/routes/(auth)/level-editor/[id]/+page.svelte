<script lang="ts">
  import {
    callAPI,
    getMediaUrl,
    type APICellTexture,
    type APIDecoration,
    type APILevelData,
    type APILevelDecorationData,
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
  import DynamicModel from "$lib/renderer/model/dynamic";
  import ModelInstance from "$lib/renderer/model/instance";
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
  let input: { type: "none" } | { type: "dragging" | "down"; button: number } = {
    type: "none",
  };
  let dragStartCoord: Cartesian | null = null;
  let dragCurrentCoord: Cartesian | null = null;
  let rectId: number;
  let selectedArea: {
    center: Cartesian;
    width: number;
    height: number;
    rotation: number;
    scale: number;
  } | null = $state(null);
  let rotation: string | number = $state(0);
  let scale: string | number = $state(1);
  let selectedDecorations: APILevelDecorationData[] = [];
  let decorationInstanceById: Record<string, ModelInstance> = {};
  const decorationModelLookup: Record<string, number> = {};

  $effect(() => {
    if (!selectedArea) {
      rotation = 0;
      scale = 1;
      return;
    }

    if (typeof rotation === "string") {
      rotation = 0;
    }
    if (typeof scale === "string") {
      scale = 1;
    }

    if (rotation > 360) {
      rotation = 360;
    } else if (rotation < -360) {
      rotation = -360;
    }

    const rotationDelta = rotation - selectedArea.rotation;
    const scaleDelta = scale / selectedArea.scale;
    if (rotationDelta === 0 && scaleDelta === 0) {
      return;
    }

    // for each selected decoration, rotate around the center of the selected area
    const pivot: GLM.vec2 = [selectedArea.center.x, selectedArea.center.y];
    for (const decoration of selectedDecorations) {
      const decorationIndex = levelData.objects.decorations.findIndex(
        (d) => d.id === decoration.id,
      );
      const d = levelData.objects.decorations[decorationIndex];

      const position = GLM.vec2.create();
      GLM.vec2.rotate(position, [d.x, d.y], pivot, degToRad(rotationDelta));
      GLM.vec2.sub(position, position, pivot);
      GLM.vec2.scaleAndAdd(position, pivot, position, scaleDelta);
      d.x = position[0];
      d.y = position[1];
      d.rotation += rotationDelta;
      d.scale *= scaleDelta;
      levelData.objects.decorations[decorationIndex] = d;

      decorationInstanceById[d.id].transform = buildDecorationTransform(
        d.x,
        d.y,
        d.z,
        d.rotation,
        d.scale,
      );
    }

    selectedArea.rotation = rotation;
    selectedArea.scale = scale;
  });

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
          objects: {
            decorations: [],
          },
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
          const uri = getMediaUrl(decorationMediaLookup[decoration]);
          const modelId = await renderer.createDynamicGLBElement(uri); // TODO: use static model
          decorationModelLookup[decoration] = modelId;
        }),
      ).then(() => {
        for (const decoration of levelData.objects.decorations) {
          createDecorationInstance(
            decoration.id,
            levelData.decorations[decoration.index],
            decoration.x,
            decoration.y,
            decoration.z,
            decoration.rotation,
            decoration.scale,
          );
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

      if (!selectedArea) {
        if (!selectedTexture && input.button === MouseButton.Left) {
          const width = maxX - minX;
          const height = maxY - minY;
          drawRectangle(
            rect,
            new Cartesian((minX + maxX) / 2, (minY + maxY) / 2),
            width,
            height,
            0,
            new Float32Array([1, 1, 1, 1]),
          );
        } else {
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
      }
    }

    // draw selected area
    if (selectedArea) {
      drawRectangle(
        rect,
        selectedArea.center,
        selectedArea.width * selectedArea.scale,
        selectedArea.height * selectedArea.scale,
        selectedArea.rotation,
        new Float32Array([1, 1, 1, 1]),
      );
    }

    // draw the decorations
    for (const decoration of levelData.decorations) {
      const model = renderer.getAndUseElement<DynamicModel>(decorationModelLookup[decoration]);
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

        const coord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y);
        if (coord.x < 0 || coord.x >= GRID_WIDTH || coord.y < 0 || coord.y >= GRID_HEIGHT) {
          return;
        }

        const id = crypto.randomUUID();
        createDecorationInstance(id, selectedDecoration, coord.x, coord.y, 0.1, 0, 1); // TODO: handle different z positions
        levelData.objects.decorations.push({
          id,
          index: decorationIndex,
          x: coord.x,
          y: coord.y,
          z: 0.1,
          rotation: 0,
          scale: 1,
        });
      }
    } else {
      input = { type: "down", button: event.button };
      const coord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y);
      if (event.button === MouseButton.Left && !selectedTexture) {
        dragStartCoord = coord;
      } else {
        dragStartCoord = coord.round();
      }
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
        if (event.button === MouseButton.Left) {
          if (selectedTexture) {
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
                levelData.grid[y][x] = {
                  texture: textureIndex,
                };
              }
            }
          } else if (!selectedArea) {
            // select all decorations in the area
            let minY = Math.min(dragStartCoord!.y, dragCurrentCoord.y);
            let maxY = Math.max(dragStartCoord!.y, dragCurrentCoord.y);
            let minX = Math.min(dragStartCoord!.x, dragCurrentCoord.x);
            let maxX = Math.max(dragStartCoord!.x, dragCurrentCoord.x);
            const decorationsToSelect = levelData.objects.decorations.filter(
              (decoration) =>
                decoration.x >= minX &&
                decoration.x <= maxX &&
                decoration.y >= minY &&
                decoration.y <= maxY,
            );
            if (decorationsToSelect.length > 0) {
              const decorationsByX = decorationsToSelect.toSorted((a, b) => a.x - b.x);
              const decorationsByY = decorationsToSelect.toSorted((a, b) => a.y - b.y);
              minX = decorationsByX[0].x - 1 * decorationsByX[0].scale;
              maxX = decorationsByX.at(-1)!.x + 1 * decorationsByX.at(-1)!.scale;
              minY = decorationsByY[0].y - 1 * decorationsByY[0].scale;
              maxY = decorationsByY.at(-1)!.y + 1 * decorationsByY.at(-1)!.scale;
              selectedArea = {
                center: new Cartesian((minX + maxX) / 2, (minY + maxY) / 2),
                width:
                  decorationsToSelect.length === 1
                    ? Math.max(1, 2 * decorationsToSelect[0].scale)
                    : Math.max(maxX - minX, 2),
                height:
                  decorationsToSelect.length === 1
                    ? Math.max(1, 2 * decorationsToSelect[0].scale)
                    : Math.max(maxY - minY, 2),
                rotation: 0,
                scale: 1,
              };
              selectedDecorations = decorationsToSelect;
            }
          }
        } else if (event.button === MouseButton.Right) {
          // erase
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
                continue;
              }
              levelData.grid[y][x] = null;
            }
          }
        }
      }
      dragStartCoord = null;
      dragCurrentCoord = null;
    } else if (input.type === "down") {
      input = { type: "none" };
      dragStartCoord = null;
      dragCurrentCoord = null;
      if (event.button === MouseButton.Left) {
        // select the closest decoration within an area
        selectedArea = null;
        const coord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y);
        const nearestDecoration = levelData.objects.decorations
          .sort(
            (a, b) =>
              new Cartesian(a.x, a.y).distance(coord) - new Cartesian(b.x, b.y).distance(coord),
          )
          .at(0);
        if (!nearestDecoration) {
          return;
        }
        const center = new Cartesian(nearestDecoration.x, nearestDecoration.y);
        if (center.distance(coord) > Math.max(1, 1 * nearestDecoration.scale)) {
          return;
        }
        selectedArea = {
          center,
          width: Math.max(1, 2 * nearestDecoration.scale),
          height: Math.max(1, 2 * nearestDecoration.scale),
          rotation: 0,
          scale: 1,
        };
        selectedDecorations = [nearestDecoration];
      }
    }
  }

  function handleMove(event: GameMouseMoveEvent) {
    if (input.type === "dragging") {
      const coord = renderer.canvasCoordToWorldCoord(camera, event.x, event.y);
      if (input.button === MouseButton.Middle) {
        const end = renderer.canvasCoordToWorldCoord(camera, event.x, event.y);
        const start = renderer.canvasCoordToWorldCoord(
          camera,
          event.x - event.deltaX,
          event.y - event.deltaY,
        );
        const delta = start.subtract(end);

        camera?.translate(GLM.vec3.fromValues(-delta.x, delta.y, 0));
      } else if (input.button === MouseButton.Left) {
        if (selectedTexture) {
          dragCurrentCoord = coord.round();
        } else {
          dragCurrentCoord = coord;
        }
        if (selectedArea) {
          // move selected area and the objects within if the mouse is in the selected area
          if (dragCurrentCoord.x + selectedArea.width / 2 > GRID_WIDTH) {
            dragCurrentCoord.x = GRID_WIDTH - selectedArea.width / 2;
          }
          if (dragCurrentCoord.x - selectedArea.width / 2 < 0) {
            dragCurrentCoord.x = 0 + selectedArea.width / 2;
          }
          if (dragCurrentCoord.y + selectedArea.height / 2 > GRID_HEIGHT) {
            dragCurrentCoord.y = GRID_HEIGHT - selectedArea.height / 2;
          }
          if (dragCurrentCoord.y - selectedArea.height / 2 < 0) {
            dragCurrentCoord.y = 0 + selectedArea.height / 2;
          }
          const deltaX = dragCurrentCoord.x - selectedArea.center.x;
          const deltaY = dragCurrentCoord.y - selectedArea.center.y;
          selectedArea.center = new Cartesian(dragCurrentCoord.x, dragCurrentCoord.y);
          for (const selected of selectedDecorations) {
            const index = levelData.objects.decorations.findIndex(
              (decoration) => decoration.id === selected.id,
            )!;
            const decoration = levelData.objects.decorations[index];
            decoration.x += deltaX;
            decoration.y += deltaY;
            levelData.objects.decorations[index] = decoration;
            decorationInstanceById[decoration.id].transform = buildDecorationTransform(
              decoration.x,
              decoration.y,
              decoration.z,
              decoration.rotation,
              decoration.scale,
            );
          }
        }
      } else if (input.button === MouseButton.Right) {
        dragCurrentCoord = coord.round();
      }
    } else if (input.type === "down") {
      input = { type: "dragging", button: input.button };
      if (input.button === MouseButton.Left) {
        if (selectedArea && dragStartCoord) {
          const minX = selectedArea.center.x - selectedArea.width / 2;
          const maxX = selectedArea.center.x + selectedArea.width / 2;
          const minY = selectedArea.center.y - selectedArea.height / 2;
          const maxY = selectedArea.center.y + selectedArea.height / 2;
          if (
            dragStartCoord.x >= minX &&
            dragStartCoord.x <= maxX &&
            dragStartCoord.y >= minY &&
            dragStartCoord.y <= maxY
          ) {
            return;
          }
        }
        selectedArea = null;
        selectedDecorations = [];
      } else if (input.button === MouseButton.Right) {
        selectedArea = null;
        selectedDecorations = [];
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

    const uri = getMediaUrl(decoration.mediaId);
    const modelId = await renderer.createDynamicGLBElement(uri); // TODO: use static model
    decorationModelLookup[decoration.key] = modelId;
    levelData.decorations.push(decoration.key);
  }

  function buildDecorationTransform(
    x: number,
    y: number,
    z: number,
    rotation: number,
    scale: number,
  ): GLM.mat4 {
    const transform = GLM.mat4.create();
    GLM.mat4.translate(transform, transform, GLM.vec3.fromValues(x, y, z));
    GLM.mat4.rotateX(transform, transform, degToRad(90));
    GLM.mat4.rotateY(transform, transform, degToRad(rotation));
    GLM.mat4.scale(transform, transform, GLM.vec3.fromValues(scale, scale, scale));
    return transform;
  }

  function createDecorationInstance(
    id: string,
    key: string,
    x: number,
    y: number,
    z: number,
    rotation: number,
    scale: number,
  ): ModelInstance {
    const model = renderer.getElement<DynamicModel>(decorationModelLookup[key]);
    const instance = model.createInstance();
    instance.transform = buildDecorationTransform(x, y, z, rotation, scale);
    instance.updateTransforms();
    instance.computeSkinningMatrix();
    decorationInstanceById[id] = instance;
    return instance;
  }

  function drawRectangle(
    rect: Rectangle,
    center: Cartesian,
    width: number,
    height: number,
    rotation: number,
    color: Float32Array,
  ) {
    const buffer = rect.allocate(4);
    let offset = 0;

    const pivot = GLM.mat4.create();
    GLM.mat4.translate(pivot, pivot, GLM.vec3.fromValues(center.x, center.y, 10));
    GLM.mat4.rotateZ(pivot, pivot, degToRad(rotation));

    const sides: Array<{ offset: GLM.vec3; scale: GLM.vec3 }> = [
      { offset: [-width / 2, 0, 0], scale: [0.1, height, 1] }, // left
      { offset: [0, height / 2, 0], scale: [width, 0.1, 1] }, // top
      { offset: [width / 2, 0, 0], scale: [0.1, height, 1] }, // right
      { offset: [0, -height / 2, 0], scale: [width, 0.1, 1] }, // bottom
    ];

    for (const side of sides) {
      const model = GLM.mat4.clone(pivot);
      GLM.mat4.translate(model, model, side.offset);
      GLM.mat4.scale(model, model, side.scale);
      buffer.set(model, offset);
      buffer.set(color, offset + model.length);
      offset += rect.instanceSize;
    }

    rect.draw();
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
                if (selectedTexture === cellTexture.key) {
                  selectedTexture = null;
                } else {
                  selectedDecoration = null;
                  selectedArea = null;
                  selectedDecorations = [];
                  handleLoadTexture(cellTexture).then(() => {
                    selectedTexture = cellTexture.key;
                  });
                }
              }}
            >
              <img
                alt={cellTexture.displayName}
                src={getMediaUrl(cellTexture.mediaId)}
                width={64}
                height={64}
                class="texture border-2 border-gray-800 group-data-[selected=true]:border-gray-200 rounded"
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
                  selectedArea = null;
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
                class="size-16 border-2 border-gray-800 group-data-[selected=true]:border-gray-200 rounded"
              />
            </button>
          </li>
        {/each}
      </ul>
    </div>

    {#if selectedArea}
      <StyledInput type="number" placeholder="Rotation (degrees)" bind:value={rotation} />
      <StyledInput type="number" placeholder="Scale" bind:value={scale} step={0.1} />
    {/if}
  </div>
</main>

<style>
  .texture {
    image-rendering: pixelated;
  }
</style>

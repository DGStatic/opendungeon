<script lang="ts">
  import Renderer from "$lib/renderer";
  import { onMount } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import * as GLM from "gl-matrix";
  import { degToRad } from "$lib/point";
  import { OrthographicCamera, type Camera } from "$lib/renderer/camera";
  import { getMediaUrl } from "$lib/api";
  import type ModelInstance from "$lib/renderer/model/instance";
  import type DynamicModel from "$lib/renderer/model/dynamic";

  type Props = HTMLAttributes<HTMLCanvasElement> & {
    mediaId: string;
    autoRotate?: boolean;
  };

  let { mediaId, autoRotate = false, class: customClass }: Props = $props();
  let renderer: Renderer;
  let camera: Camera;
  let canvas = $state<HTMLCanvasElement>();
  let modelId: number | null = $state(null);
  let instance: ModelInstance | null;

  onMount(async () => {
    renderer = new Renderer(canvas!, {
      resizeToWindow: false,
      backgroundColor: new Float32Array([0, 0, 0, 1]),
    });
    camera = new OrthographicCamera(canvas!.width / canvas!.height);
    camera.rotateX(degToRad(15));
    GLM.mat4.translate(camera.projection, camera.projection, GLM.vec3.fromValues(0, -1, 0));
    const uri = getMediaUrl(mediaId);
    modelId = await renderer.createDynamicGLBElement(uri);
    const model = renderer.getAndUseElement<DynamicModel>(modelId); // TODO: use static model
    const inst = model.createInstance(crypto.randomUUID());
    const transform = GLM.mat4.create();
    GLM.mat4.translate(transform, transform, GLM.vec3.fromValues(0, 0, 0));
    inst.transform = transform;
    inst.updateTransforms();
    inst.computeSkinningMatrix();
    instance = inst;

    loop();
  });

  function tick() {
    if (!autoRotate || !instance) {
      return;
    }
  }

  function draw() {
    if (!renderer || !instance) {
      return;
    }

    renderer.clear();

    if (autoRotate) {
      GLM.mat4.rotateY(instance?.transform, instance?.transform, degToRad(-0.5));
    }
    const model = renderer.getElement<DynamicModel>(modelId!);
    model.setCamera(camera);
    model.draw();
  }

  function loop() {
    window.requestAnimationFrame(() => {
      tick();
      draw();
      loop();
    });
  }
</script>

<canvas class={customClass} bind:this={canvas}></canvas>

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export const SPECIMEN_BEATS = {
  approach: 0,
  dock: 0.12,
  partition: 0.3,
  divergence: 0.55,
  reconcile: 0.74,
  carry: 0.9,
  end: 1,
} as const;

/** One clock for geometry, labels, connectors and camera. All writes are outside React. */
export function createSceneController(
  host: HTMLElement,
  draw: (progress: number) => void,
  options: { scroll?: boolean; intro?: number } = {},
) {
  const clock = { progress: 0 };
  const timeline = gsap.timeline({ paused: true, onUpdate: () => draw(clock.progress) });
  timeline.to(clock, { progress: 1, duration: 1, ease: "none" });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seek = (progress: number) => {
    timeline.progress(Math.max(0, Math.min(1, progress)));
  };
  const trigger =
    options.scroll && !reduced
      ? ScrollTrigger.create({
          trigger: host,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => seek(self.progress),
          invalidateOnRefresh: true,
        })
      : null;
  let intro: gsap.core.Tween | undefined;
  if (!reduced && options.intro && !trigger?.progress) {
    intro = gsap.to(timeline, { progress: options.intro, duration: 1.8, ease: "power2.out" });
  } else {
    seek(reduced ? 1 : 0);
  }
  return {
    seek: (progress: number) => {
      intro?.kill();
      seek(progress);
    },
    destroy: () => {
      intro?.kill();
      trigger?.kill();
      timeline.kill();
    },
  };
}

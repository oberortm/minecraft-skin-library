// Emotes and poses for the presentation figure, as skinview3d animations. Angles follow skinview3d:
// arm rotation.x < 0 lifts the arm forwards, rightArm.rotation.z < 0 / leftArm.rotation.z > 0 lift it sideways.

export const EMOTES = ["wave", "dance", "cheer", "swing", "bow", "sneak", "sit"];

const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const clamp01 = t => Math.max(0, Math.min(1, t));

/** Build the animation classes on top of the loaded skinview3d module. */
export function emoteAnimations(sv) {
  const P = sv.PlayerAnimation;
  /** Shared start: blend from the resting pose into the emote over the first fraction of a second. */
  const blend = (a, secs = 0.35) => ease(clamp01(a.progress / secs));

  class Wave extends P {
    animate(p) {
      const t = this.progress, k = blend(this);
      p.skin.rightArm.rotation.z = -(Math.PI - 0.5) * k + Math.sin(t * 9) * 0.28 * k;
      p.skin.rightArm.rotation.x = -0.15 * k;
      p.skin.leftArm.rotation.z = 0.06;
      p.skin.head.rotation.z = Math.sin(t * 4.5) * 0.08 * k;
      p.skin.head.rotation.y = 0.15 * k;
    }
  }
  class Dance extends P {
    animate(p) {
      const t = this.progress * 6.5, k = blend(this);
      p.position.y = Math.abs(Math.sin(t)) * 1.4 * k;
      p.rotation.z = Math.sin(t) * 0.07 * k;
      p.rotation.y = Math.sin(t / 2) * 0.35 * k;
      p.skin.rightArm.rotation.z = (-0.4 - Math.max(0, Math.sin(t)) * 2.2) * k;
      p.skin.leftArm.rotation.z = (0.4 + Math.max(0, -Math.sin(t)) * 2.2) * k;
      p.skin.rightArm.rotation.x = Math.cos(t) * 0.4 * k;
      p.skin.leftArm.rotation.x = -Math.cos(t) * 0.4 * k;
      p.skin.rightLeg.rotation.x = Math.max(0, Math.sin(t)) * -0.6 * k;
      p.skin.leftLeg.rotation.x = Math.max(0, -Math.sin(t)) * -0.6 * k;
      p.skin.head.rotation.x = Math.sin(t * 2) * 0.12 * k;
      p.skin.head.rotation.z = -Math.sin(t) * 0.1 * k;
    }
  }
  class Cheer extends P {
    animate(p) {
      const t = this.progress * 5, k = blend(this);
      const pump = (Math.sin(t) + 1) / 2;
      p.position.y = Math.max(0, Math.sin(t)) * 2.2 * k;
      p.skin.rightArm.rotation.z = -(2.5 + pump * 0.4) * k;
      p.skin.leftArm.rotation.z = (2.5 + pump * 0.4) * k;
      p.skin.rightLeg.rotation.z = -0.12 * pump * k;
      p.skin.leftLeg.rotation.z = 0.12 * pump * k;
      p.skin.head.rotation.x = -0.25 * k;
    }
  }
  class Swing extends P {
    animate(p) {
      // wind up, strike, follow through, recover: once every 1.3 s
      const c = (this.progress % 1.3) / 1.3, k = blend(this);
      let a;
      if (c < 0.35) a = -2.4 * ease(c / 0.35);
      else if (c < 0.5) a = -2.4 + 2.9 * ease((c - 0.35) / 0.15);
      else a = 0.5 * (1 - ease((c - 0.5) / 0.5));
      p.skin.rightArm.rotation.x = a * k;
      p.skin.rightArm.rotation.z = -0.2 * k;
      p.rotation.y = (c < 0.35 ? 0.3 * ease(c / 0.35) : 0.3 - 0.6 * ease(clamp01((c - 0.35) / 0.3))) * k;
      p.skin.leftArm.rotation.x = -0.4 * k;
      p.skin.rightLeg.rotation.x = -0.25 * k;
      p.skin.leftLeg.rotation.x = 0.2 * k;
    }
  }
  class Bow extends P {
    animate(p) {
      // draw the string: bow arm straight ahead, the other hand pulls back to the cheek
      const draw = clamp01(((this.progress % 2.6) - 0.3) / 1.2), k = blend(this, 0.5);
      p.rotation.y = 0.5 * k;
      p.skin.head.rotation.y = -0.45 * k;
      p.skin.rightArm.rotation.x = -Math.PI / 2 * k;
      p.skin.rightArm.rotation.y = -0.15 * k;
      p.skin.leftArm.rotation.x = -Math.PI / 2 * k;
      p.skin.leftArm.rotation.y = (0.5 + draw * 0.45) * k;
      p.skin.leftArm.rotation.z = Math.sin(this.progress * 30) * 0.008 * draw;   // a slight tremble at full draw
    }
  }
  class Sneak extends P {
    animate(p) {
      const k = blend(this, 0.25), step = Math.sin(this.progress * 3.5);
      p.skin.body.rotation.x = 0.45 * k;
      p.skin.head.position.z = 2.6 * k; p.skin.head.position.y = -0.8 * k;
      p.skin.rightArm.position.z = 2.4 * k; p.skin.leftArm.position.z = 2.4 * k;
      p.skin.rightArm.position.y = -2 - 0.6 * k; p.skin.leftArm.position.y = -2 - 0.6 * k;
      p.skin.rightArm.rotation.x = (0.4 + step * 0.2) * k; p.skin.leftArm.rotation.x = (0.4 - step * 0.2) * k;
      p.skin.rightLeg.rotation.x = step * 0.3 * k; p.skin.leftLeg.rotation.x = -step * 0.3 * k;
      p.position.y = -1.2 * k;
    }
  }
  class Sit extends P {
    animate(p) {
      const k = blend(this, 0.5);
      p.position.y = -11 * k;
      p.skin.rightLeg.rotation.x = -Math.PI / 2 * k; p.skin.leftLeg.rotation.x = -Math.PI / 2 * k;
      p.skin.rightLeg.rotation.y = 0.12 * k; p.skin.leftLeg.rotation.y = -0.12 * k;
      p.skin.rightArm.rotation.x = -0.55 * k; p.skin.leftArm.rotation.x = -0.55 * k;
      p.skin.head.rotation.x = Math.sin(this.progress * 0.8) * 0.06;
      p.skin.head.rotation.y = Math.sin(this.progress * 0.5) * 0.25;
    }
  }
  return { wave: Wave, dance: Dance, cheer: Cheer, swing: Swing, bow: Bow, sneak: Sneak, sit: Sit };
}

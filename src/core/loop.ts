export class FixedStepLoop {
  private acc = 0;
  constructor(private fixedDt: number, private maxFrameDt: number) {}
  advance(frameDt: number): number {
    this.acc += Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    let steps = 0;
    while (this.acc + 1e-9 >= this.fixedDt) { this.acc -= this.fixedDt; steps++; }
    if (this.acc < 0) this.acc = 0;
    return steps;
  }
  reset(): void { this.acc = 0; }
}

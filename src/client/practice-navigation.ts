/** Serialize view/end decisions without owning practice data or playback. */
export class PracticeNavigation {
  private revision = 0;
  private flight?: { key: string; promise: Promise<boolean> };

  get pending() {
    return Boolean(this.flight);
  }

  invalidate() {
    this.revision++;
    this.flight = undefined;
  }

  transition(
    key: string,
    prepare: () => Promise<boolean>,
    apply: () => void,
    stillOwned: () => boolean,
  ): Promise<boolean> {
    if (this.flight) return this.flight.key === key ? this.flight.promise : Promise.resolve(false);
    const revision = this.revision;
    const flight = {
      key,
      promise: Promise.resolve().then(async () => {
        if (revision !== this.revision || !stillOwned()) return false;
        if (!(await prepare()) || revision !== this.revision || !stillOwned()) return false;
        apply();
        return true;
      }),
    };
    this.flight = flight;
    flight.promise = flight.promise.finally(() => {
      if (this.flight === flight) this.flight = undefined;
    });
    return flight.promise;
  }
}

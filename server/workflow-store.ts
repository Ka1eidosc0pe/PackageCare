import type { Delivery } from "../shared/domain.js";
import type { Store } from "./store.js";
export class StaleWorkflow extends Error {
  constructor() {
    super("This processing attempt has been superseded.");
    this.name = "StaleWorkflow";
  }
}
// Check the generation again inside the store's atomic update, after any slow model/media call.
export class WorkflowStore implements Store {
  constructor(
    private store: Store,
    private id: string,
    private generation: string,
  ) {}
  private check(id: string, current?: Delivery) {
    if (
      id !== this.id ||
      !current ||
      current.workflowGeneration !== this.generation
    )
      throw new StaleWorkflow();
  }
  async get(id: string) {
    const d = await this.store.get(id);
    this.check(id, d);
    return d;
  }
  async change(id: string, fn: (current?: Delivery) => Delivery) {
    return this.store.change(id, (current) => {
      this.check(id, current);
      return fn(current);
    });
  }
  async list(): Promise<Delivery[]> {
    throw new Error("Workers only access their assigned delivery.");
  }
  async remove(): Promise<void> {
    throw new Error("Workers do not delete deliveries.");
  }
}

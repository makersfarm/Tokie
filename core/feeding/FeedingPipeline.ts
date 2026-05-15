import type { TokenEvent } from '../types';
import { tokensToNutrition } from './nutrition';
import type { EventsDb } from '../storage/eventsDb';
import type { PetState } from '../pet/PetState';

export class FeedingPipeline {
  constructor(private db: EventsDb, private pet: PetState) {}

  handle(e: TokenEvent): void {
    const inserted = this.db.insert(e);
    if (!inserted) return;
    const nutrition = tokensToNutrition(e.tokens);
    if (nutrition > 0) this.pet.feed(nutrition);
  }
}

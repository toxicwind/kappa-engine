export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@toxicwind/schema/event"
import { EventManifest } from "@toxicwind/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)

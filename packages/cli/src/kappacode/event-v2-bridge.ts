import type { EventV2 } from "@toxicwind/core/event"
import { Location } from "@toxicwind/core/location"
import { Project } from "@toxicwind/core/project"
import { AbsolutePath } from "@toxicwind/core/schema"
import { Effect } from "effect"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"

export const batch =
  (events: EventV2.Interface): EventV2.Interface["publishAll"] =>
  (entries, options) =>
    Effect.gen(function* () {
      if (options?.location) return yield* events.publishAll(entries, options)
      const ctx = yield* InstanceRef
      if (!ctx) return yield* events.publishAll(entries, options)
      const workspace = yield* WorkspaceRef
      return yield* events.publishAll(entries, {
        ...options,
        location: new Location.Info({
          directory: AbsolutePath.make(ctx.directory),
          ...(workspace ? { workspaceID: workspace } : {}),
          project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
        }),
      })
    })

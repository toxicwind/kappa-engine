import { AbsolutePath } from "@toxicwind/core/schema"
import { Location } from "@toxicwind/core/location"
import { Pty } from "@toxicwind/core/pty"
import { Effect } from "effect"

export function clearPtys(directory: string, workspaceID: Location.Ref["workspaceID"]) {
  return Effect.promise(() =>
    Pty.terminateDirectory(
      Location.Ref.make({
        directory: AbsolutePath.make(directory),
        workspaceID,
      }),
    ),
  )
}

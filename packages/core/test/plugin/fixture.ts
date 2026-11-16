import { AgentV2 } from "@toxicwind/core/agent"
import { AISDK } from "@toxicwind/core/aisdk"
import { Catalog } from "@toxicwind/core/catalog"
import { CommandV2 } from "@toxicwind/core/command"
import { Credential } from "@toxicwind/core/credential"
import { AppNodeBuilder } from "@toxicwind/core/effect/app-node-builder"
import { LayerNodePlatform } from "@toxicwind/core/effect/app-node-platform"
import { LayerNode } from "@toxicwind/core/effect/layer-node"
import { EventV2 } from "@toxicwind/core/event"
import { FileSystem } from "@toxicwind/core/filesystem"
import { FSUtil } from "@toxicwind/core/fs-util"
import { Integration } from "@toxicwind/core/integration"
import { Location } from "@toxicwind/core/location"
import { Npm } from "@toxicwind/core/npm"
import { PluginV2 } from "@toxicwind/core/plugin"
import { Reference } from "@toxicwind/core/reference"
import { SkillV2 } from "@toxicwind/core/skill"
import { Global } from "@toxicwind/core/global"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { tempLocationLayer } from "../fixture/location"

// kappacode_change - Credential imports Global.data/auth.json on startup, so without this the suite
// reads the developer's real credential store and its results depend on whether they are logged in.
const globalLayer = Global.layerWith({ data: fs.mkdtempSync(path.join(os.tmpdir(), "kappa-plugin-test-")) })

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
    [Global.node, globalLayer], // kappacode_change
  ],
)

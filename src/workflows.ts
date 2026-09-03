/**
 * workflows.ts: register research steps as Workflow tasks.
 *
 * Each plain function from research-stock.ts is wrapped with task(...).
 * The root task (researchStock) chains those wrappers with ctx.run so
 * Render creates child task runs (and can retry each step on its own).
 *
 * The web service starts ONLY the root: {slug}/researchStock
 */

import { task, type TaskContext } from "@renderinc/sdk/workflows"
import {
  loadCompanyFacts,
  collectSignals,
  identifyCatalysts,
  identifyRisks,
  writeMemo,
  type ResearchMemo,
} from "./research-stock.js"

/** Step task: look up company name from the mock dataset. */
export const loadCompanyFactsTask = task(
  {
    name: "loadCompanyFacts",
    timeoutSeconds: 120,
  },
  async function loadCompanyFactsTask(ctx: TaskContext, ticker: string) {
    return loadCompanyFacts(ticker)
  },
)

/** Step task: mock bullish / mixed signals. */
export const collectSignalsTask = task(
  {
    name: "collectSignals",
    timeoutSeconds: 120,
  },
  async function collectSignalsTask(ctx: TaskContext, ticker: string) {
    return collectSignals(ticker)
  },
)

/** Step task: mock upcoming catalysts. */
export const identifyCatalystsTask = task(
  {
    name: "identifyCatalysts",
    timeoutSeconds: 120,
  },
  async function identifyCatalystsTask(ctx: TaskContext, ticker: string) {
    return identifyCatalysts(ticker)
  },
)

/** Step task: mock key risks. */
export const identifyRisksTask = task(
  {
    name: "identifyRisks",
    timeoutSeconds: 120,
  },
  async function identifyRisksTask(ctx: TaskContext, ticker: string) {
    return identifyRisks(ticker)
  },
)

/** Step task: combine step outputs into the memo. */
export const writeMemoTask = task(
  {
    name: "writeMemo",
    timeoutSeconds: 120,
  },
  async function writeMemoTask(
    ctx: TaskContext,
    input: {
      ticker: string
      company: string
      currentSignals: string[]
      potentialCatalysts: string[]
      keyRisks: string[]
    },
  ): Promise<ResearchMemo> {
    return writeMemo(input)
  },
)

/**
 * Root task: what the web service starts.
 *
 * Chain step tasks with ctx.run. Do not call the wrappers as functions,
 * and do not call only the plain research-stock functions. Independent
 * steps use Promise.all around ctx.run.
 */
export const researchStockTask = task(
  {
    name: "researchStock",
    timeoutSeconds: 120,
  },
  async function researchStockTask(
    ctx: TaskContext,
    ticker: string,
  ): Promise<ResearchMemo> {
    const facts = await ctx.run(loadCompanyFactsTask, ticker)

    // Independent steps run together (parallel chained task runs).
    const [currentSignals, potentialCatalysts, keyRisks] = await Promise.all([
      ctx.run(collectSignalsTask, facts.ticker),
      ctx.run(identifyCatalystsTask, facts.ticker),
      ctx.run(identifyRisksTask, facts.ticker),
    ])

    return ctx.run(writeMemoTask, {
      ticker: facts.ticker,
      company: facts.company,
      currentSignals,
      potentialCatalysts,
      keyRisks,
    })
  },
)

console.log(
  "Registered Workflow tasks: loadCompanyFacts, collectSignals, identifyCatalysts, identifyRisks, writeMemo, researchStock",
)
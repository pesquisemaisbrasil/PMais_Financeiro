"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import type { TooltipContentProps } from "recharts"
import { cn } from "@/lib/utils"

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
  }
}

type ChartContextProps = { config: ChartConfig }

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`
  // cor de cada série vira a variável `--color-<chave>` dentro do gráfico
  const colorVars = Object.fromEntries(
    Object.entries(config)
      .filter(([, item]) => item.color)
      .map(([key, item]) => [`--color-${key}`, item.color])
  ) as React.CSSProperties

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden [&_.recharts-sector]:outline-hidden",
          className
        )}
        style={{ ...colorVars, ...style }}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  label,
  headingFormatter,
  valueFormatter,
  hideLabel = false,
}: Partial<Pick<TooltipContentProps<number, string>, "active" | "payload" | "label">> & {
  className?: string
  /** texto do cabeçalho a partir do rótulo do eixo */
  headingFormatter?: (label: string) => React.ReactNode
  /** número mostrado na linha de cada série */
  valueFormatter?: (value: number, name: string, item: unknown) => React.ReactNode
  hideLabel?: boolean
}) {
  const { config } = useChart()
  const rows = (payload ?? []).filter((item) => item.value !== undefined && item.type !== "none")
  if (!active || rows.length === 0) return null

  const heading = hideLabel
    ? null
    : headingFormatter
      ? headingFormatter(String(label ?? ""))
      : label

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-xl",
        className
      )}
    >
      {heading ? <div className="font-medium">{heading}</div> : null}
      <div className="grid gap-1.5">
        {rows.map((item) => {
          const key = String(item.dataKey ?? item.name)
          const itemConfig = config[key]
          const color = item.color ?? item.payload?.fill
          const value = Number(item.value)
          return (
            <div key={key} className="flex w-full items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
              <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">
                {valueFormatter
                  ? valueFormatter(value, key, item)
                  : value.toLocaleString("pt-BR")}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  payload,
}: {
  className?: string
  payload?: ReadonlyArray<{ value?: unknown; dataKey?: unknown; color?: string }>
}) {
  const { config } = useChart()
  if (!payload?.length) return null

  return (
    <ul className={cn("flex flex-wrap items-center justify-center gap-4 pt-3", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value)
        return (
          <li key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            {config[key]?.label ?? String(item.value)}
          </li>
        )
      })}
    </ul>
  )
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
}

declare module 'react-chartkick' {
  export type ScatterChartProps = {
    data: ScatterChartData[];
    xtitle: string;
    ytitle: string;
    colors?: string[];
    min: number | null;
    library: {
      elements: {
        point: {
          radius: number;
        };
      };
    };
  };
  export type ScatterChartData = {
    name: string;
    data: [number, number][];
  };
  export function ScatterChart(props: ScatterChartProps): React.ReactNode;
  export function LineChart(props: LineChartProps): React.ReactNode;
  export type LineChartProps = {
    data: LineChartData[];
    xtitle: string;
    ytitle: string;
    colors?: string[];
    min: number | null;
    library: {
      elements?: {
        point?: {
          radius: number;
        };
        line?: {
          cubicInterpolationMode: string;
        };
      };
      /** Chart.js scale options (e.g. dual y-axes) */
      scales?: Record<
        string,
        {
          type?: string;
          position?: string;
          title?: { display?: boolean; text?: string };
          grid?: { drawOnChartArea?: boolean };
          max?: number;
        }
      >;
    };
  };
  export type LineChartData = {
    name: string;
    data: [string, number][];
    dataset?: Record<string, unknown>;
  };
}

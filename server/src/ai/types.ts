// the contract every ai provider implements

export interface PlannedCell {
  title: string;
  summary: string;
}

export interface RoadmapPlan {
  title: string;
  cells: PlannedCell[];
}

export interface AiProvider {
  // short name stored on the roadmap so the ui can show where it came from
  readonly name: string;

  // plan a full roadmap for a topic (optionally tuned to a personal goal)
  generateRoadmap(
    topic: string,
    goal: string | undefined,
    moduleCount: number,
  ): Promise<RoadmapPlan>;

  // write the longer explanation shown when a cell is opened
  generateCellDetail(
    topic: string,
    cellTitle: string,
    order: number,
    moduleCount: number,
  ): Promise<string>;
}

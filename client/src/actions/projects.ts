import { BigNumber, ethers } from "ethers";
import { Dispatch } from "redux";
import ProjectRegistryABI from "../contracts/abis/ProjectRegistry.json";
import { addressesByChainID } from "../contracts/deployments";
import { global } from "../global";
import { RootState } from "../reducers";
import { ProjectEvent } from "../types";
import { fetchGrantData } from "./grantsMetadata";

export const PROJECTS_LOADING = "PROJECTS_LOADING";
interface ProjectsLoadingAction {
  type: typeof PROJECTS_LOADING;
}

export const PROJECTS_LOADED = "PROJECTS_LOADED";
interface ProjectsLoadedAction {
  type: typeof PROJECTS_LOADED;
  projects: ProjectEvent[];
}

export const PROJECTS_UNLOADED = "PROJECTS_UNLOADED";
export interface ProjectsUnloadedAction {
  type: typeof PROJECTS_UNLOADED;
}

export type ProjectsActions =
  | ProjectsLoadingAction
  | ProjectsLoadedAction
  | ProjectsUnloadedAction;

const projectsLoading = () => ({
  type: PROJECTS_LOADING,
});

const projectsLoaded = (projects: ProjectEvent[]) => ({
  type: PROJECTS_LOADED,
  projects,
});

const projectsUnload = () => ({
  type: PROJECTS_UNLOADED,
});

export function aggregateEvents(
  created: ProjectEvent[],
  updated: ProjectEvent[]
): ProjectEvent[] {
  const result = [...created, ...updated].reduce(
    (prev: any, cur: ProjectEvent) => {
      const value = prev;
      if (value[cur.id] === undefined || cur.block > value[cur.id].block) {
        let createdAtBlock;
        if (value[cur.id] === undefined) {
          createdAtBlock = cur.block;
        } else {
          createdAtBlock =
            value[cur.id].block > cur.block ? cur.block : value[cur.id].block;
        }
        value[cur.id] = cur;
        value[cur.id].createdAtBlock = createdAtBlock;
      }
      return value;
    },
    {}
  );

  return Object.values(result);
}

export const loadProjects =
  (withMetaData?: boolean) =>
  async (dispatch: Dispatch, getState: () => RootState) => {
    dispatch(projectsLoading());

    const state = getState();
    const { chainID } = state.web3;

    const addresses = addressesByChainID(chainID!);
    const contract = new ethers.Contract(
      addresses.projectRegistry,
      ProjectRegistryABI,
      global.web3Provider!
    );

    const createdFilter = contract.filters.ProjectCreated(
      null,
      state.web3.account
    );
    const createdEvents = await contract.queryFilter(createdFilter);

    const createdIds: ProjectEvent[] = createdEvents.map((event: any) => ({
      id: BigNumber.from(event.args.projectID).toNumber(),
      block: event.blockNumber,
    }));

    if (createdIds.length === 0) {
      dispatch(projectsLoaded([]));
      return;
    }

    const ids = createdIds.map((item) => ethers.utils.hexlify(item.id));
    const metadataFilter = contract.filters.MetadataUpdated(ids);
    const metadataEvents = await contract.queryFilter(metadataFilter);

    const updateIds: ProjectEvent[] = metadataEvents.map((event: any) => ({
      id: BigNumber.from(event.args[0]).toNumber(),
      block: event.blockNumber,
    }));
    const events = aggregateEvents(createdIds, updateIds);
    if (withMetaData) {
      ids.map((id) => dispatch(fetchGrantData(Number(id)) as any));
    }

    dispatch(projectsLoaded(events));
  };

export const unloadProjects = () => projectsUnload();

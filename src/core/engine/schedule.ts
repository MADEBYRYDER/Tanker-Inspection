import { MAINTENANCE_TEMPLATES, findTemplate } from '../catalog/maintenance';
import { addMonths, compareDates, daysBetween, monthLabel, nextDateInMonths, today } from '../dates';
import type {
  HomeComponent,
  HomeRecord,
  ISODate,
  MaintenanceCompletion,
  MaintenanceTemplate,
  ScheduledTask,
  TaskUrgency,
} from '../types';

export interface ScheduleOptions {
  asOf?: ISODate;
  /** A task inside this many days of its due date is "due soon". */
  dueSoonDays?: number;
  /** Beyond this many days out, a task is "scheduled" rather than "upcoming". */
  upcomingDays?: number;
}

const DEFAULT_DUE_SOON_DAYS = 30;
const DEFAULT_UPCOMING_DAYS = 120;

const CRITICALITY_RANK: Record<MaintenanceTemplate['criticality'], number> = {
  safety: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Whole-word match against a component's type and name.
 *
 * Deliberately not a substring test. `'washer'.includes` is true for "dishwasher",
 * which silently schedules washing-machine hose inspections on the dishwasher — a
 * wrong task attached to the wrong equipment, which is worse than a missing one.
 */
function typeMatches(component: HomeComponent, pattern: string): boolean {
  const haystack = `${component.type} ${component.name}`.toLowerCase();
  return new RegExp(`\\b(?:${pattern.toLowerCase()})\\b`).test(haystack);
}

function componentMatchesTemplate(component: HomeComponent, template: MaintenanceTemplate): boolean {
  if (component.retiredOn) return false;
  if (!template.appliesTo.includes(component.category)) return false;
  if (!template.typeMatch) return true;
  return typeMatches(component, template.typeMatch);
}

/**
 * The components that should each get their own instance of a template.
 *
 * For most work that is every matching component. For system-level work an
 * `anchorType` narrows it to the part the job actually belongs to, so a furnace and
 * a condenser sharing one air handler produce one filter reminder rather than two.
 */
export function componentsForTemplate(
  components: HomeComponent[],
  template: MaintenanceTemplate,
): HomeComponent[] {
  const matching = components.filter((c) => componentMatchesTemplate(c, template));
  if (!template.anchorType || matching.length === 0) return matching;
  const anchored = matching.filter((c) => typeMatches(c, template.anchorType!));
  return anchored.length > 0 ? anchored : matching.slice(0, 1);
}

function latestCompletion(
  completions: MaintenanceCompletion[],
  templateId: string,
  componentId: string | undefined,
): MaintenanceCompletion | undefined {
  let best: MaintenanceCompletion | undefined;
  for (const c of completions) {
    if (c.templateId !== templateId) continue;
    if ((c.componentId ?? undefined) !== componentId) continue;
    if (!best || compareDates(c.completedOn, best.completedOn) > 0) best = c;
  }
  return best;
}

function urgencyFor(daysUntilDue: number, opts: Required<Pick<ScheduleOptions, 'dueSoonDays' | 'upcomingDays'>>): TaskUrgency {
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= opts.dueSoonDays) return 'due_soon';
  if (daysUntilDue <= opts.upcomingDays) return 'upcoming';
  return 'scheduled';
}

/**
 * Computes the due date for one task instance.
 *
 * Seasonal work (a heating check, gutter clearing) is snapped forward to its
 * intended month rather than landing wherever the interval math puts it — a
 * furnace inspection that comes due in July is not a useful reminder.
 */
function dueDateFor(
  template: MaintenanceTemplate,
  lastCompletedOn: ISODate | undefined,
  asOf: ISODate,
): ISODate {
  const base = lastCompletedOn ? addMonths(lastCompletedOn, template.intervalMonths) : asOf;
  if (template.seasonalMonths && template.seasonalMonths.length > 0 && template.intervalMonths >= 6) {
    return nextDateInMonths(base, template.seasonalMonths);
  }
  return base;
}

/**
 * Builds the live maintenance list for a home from its equipment and its completion
 * history. Nothing here is persisted — the schedule is always recomputed, so logging
 * a single completed job immediately and correctly reshapes everything downstream of it.
 */
export function generateTasks(record: HomeRecord, options: ScheduleOptions = {}): ScheduledTask[] {
  const asOf = options.asOf ?? today();
  const opts = {
    dueSoonDays: options.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS,
    upcomingDays: options.upcomingDays ?? DEFAULT_UPCOMING_DAYS,
  };

  const tasks: ScheduledTask[] = [];

  const push = (template: MaintenanceTemplate, component?: HomeComponent) => {
    const componentId = component?.id;
    const last = latestCompletion(record.completions, template.id, componentId);
    const dueDate = dueDateFor(template, last?.completedOn, asOf);
    const daysUntilDue = daysBetween(asOf, dueDate);
    tasks.push({
      key: `${template.id}:${componentId ?? 'home'}`,
      templateId: template.id,
      componentId,
      componentName: component?.name,
      title: template.title,
      why: template.why,
      dueDate,
      urgency: urgencyFor(daysUntilDue, opts),
      criticality: template.criticality,
      lastCompletedOn: last?.completedOn,
      daysUntilDue,
      diy: template.diy,
      hireCostRangeCents: template.hireCostRangeCents,
    });
  };

  for (const template of MAINTENANCE_TEMPLATES) {
    if (template.wholeHome) {
      // Whole-home work is one task for the property, not one per detector or valve.
      push(template);
      continue;
    }
    for (const component of componentsForTemplate(record.components, template)) {
      push(template, component);
    }
  }

  return sortTasks(tasks);
}

export function sortTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((a, b) => {
    const byDate = compareDates(a.dueDate, b.dueDate);
    if (byDate !== 0) return byDate;
    const byCrit = CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality];
    if (byCrit !== 0) return byCrit;
    return a.title.localeCompare(b.title);
  });
}

export interface TaskMonthGroup {
  /** First day of the month, e.g. '2026-09-01'. */
  monthStart: ISODate;
  label: string;
  tasks: ScheduledTask[];
}

/** Groups the schedule into the month-by-month calendar the maintenance tab renders. */
export function groupTasksByMonth(tasks: ScheduledTask[], monthsAhead = 12): TaskMonthGroup[] {
  const groups = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    const monthStart = `${task.dueDate.slice(0, 7)}-01`;
    const bucket = groups.get(monthStart);
    if (bucket) bucket.push(task);
    else groups.set(monthStart, [task]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .slice(0, monthsAhead)
    .map(([monthStart, monthTasks]) => ({
      monthStart,
      label: monthLabel(monthStart),
      tasks: monthTasks,
    }));
}

/** Tasks past their due date. Feeds both the dashboard and the health penalty. */
export function overdueTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return tasks.filter((t) => t.urgency === 'overdue');
}

export function tasksForComponent(tasks: ScheduledTask[], componentId: string): ScheduledTask[] {
  return tasks.filter((t) => t.componentId === componentId);
}

/**
 * Records a completed task and returns the completion to persist. The schedule is
 * regenerated from completions, so this is the only write needed to move a task's
 * next due date.
 */
export function buildCompletion(params: {
  id: string;
  homeId: string;
  task: ScheduledTask;
  completedOn: ISODate;
  performedBy: 'diy' | 'pro';
  costCents?: number;
  vendor?: string;
  notes?: string;
}): MaintenanceCompletion {
  return {
    id: params.id,
    homeId: params.homeId,
    templateId: params.task.templateId,
    componentId: params.task.componentId,
    completedOn: params.completedOn,
    performedBy: params.performedBy,
    costCents: params.costCents,
    vendor: params.vendor,
    notes: params.notes,
  };
}

export { findTemplate };

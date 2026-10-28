import { db } from "./db";

export interface ExperienceErrorRecord {
  id: string;
  experienceId: string;
  cityId: string;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  createdAt: string;
}

/**
 * Record a runtime error captured inside a guest experience iframe.
 */
export function recordExperienceError(
  experienceId: string,
  cityId: string,
  error: {
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    stack?: string;
  }
): ExperienceErrorRecord {
  const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  try {
    db.query(
      `INSERT INTO experience_errors (id, experience_id, city_id, message, filename, lineno, colno, stack, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      experienceId,
      cityId,
      error.message || "Unknown error",
      error.filename || null,
      error.lineno || null,
      error.colno || null,
      error.stack || null,
      now
    );
  } catch (err) {
    console.warn("[ExperienceErrors] Failed to record error into SQLite", err);
  }

  return {
    id,
    experienceId,
    cityId,
    message: error.message,
    filename: error.filename,
    lineno: error.lineno,
    colno: error.colno,
    stack: error.stack,
    createdAt: now,
  };
}

/**
 * Get recent runtime errors for an experience.
 */
export function getExperienceErrors(
  experienceId: string,
  cityId?: string,
  limit = 20
): ExperienceErrorRecord[] {
  try {
    let query = "SELECT * FROM experience_errors WHERE experience_id = ?";
    const params: any[] = [experienceId];

    if (cityId) {
      query += " AND city_id = ?";
      params.push(cityId);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.query<
      {
        id: string;
        experience_id: string;
        city_id: string;
        message: string;
        filename: string | null;
        lineno: number | null;
        colno: number | null;
        stack: string | null;
        created_at: string;
      },
      any[]
    >(query).all(...params);

    return rows.map((r) => ({
      id: r.id,
      experienceId: r.experience_id,
      cityId: r.city_id,
      message: r.message,
      filename: r.filename || undefined,
      lineno: r.lineno || undefined,
      colno: r.colno || undefined,
      stack: r.stack || undefined,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Clear errors for an experience (useful in tests and re-verification).
 */
export function clearExperienceErrors(experienceId?: string): void {
  try {
    if (experienceId) {
      db.query("DELETE FROM experience_errors WHERE experience_id = ?").run(experienceId);
    } else {
      db.query("DELETE FROM experience_errors").run();
    }
  } catch {
    // Non-blocking
  }
}

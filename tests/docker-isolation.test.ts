import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

describe("Docker Container Isolation & Persistent Agent-Home Security Hardening (Issue #80)", () => {
  const composePath = path.resolve(process.cwd(), "docker-compose.yml");
  const dockerfilePath = path.resolve(process.cwd(), "Dockerfile");

  it("docker-compose.yml defines named persistent volume agent-home-data mounted to /app/agent-home", () => {
    const rawYaml = fs.readFileSync(composePath, "utf-8");

    // Named volumes block
    expect(rawYaml).toMatch(/volumes:\s*\n\s+agent-home-data:/);
    // Polymax service volume mounts
    expect(rawYaml).toContain("agent-home-data:/app/agent-home");
    expect(rawYaml).toContain("./data:/app/data");

    // Validate using docker compose config if docker is present
    const res = spawnSync("docker", ["compose", "config", "--format", "json"], {
      encoding: "utf-8",
    });
    if (res.status === 0 && res.stdout) {
      // Find the JSON block (skipping any leading stderr/stdout warning lines)
      const jsonStart = res.stdout.indexOf("{");
      if (jsonStart !== -1) {
        const compose = JSON.parse(res.stdout.slice(jsonStart));
        expect(compose.volumes["agent-home-data"]).toBeDefined();
        const volumes = compose.services.polymax.volumes;
        const hasAgentHome = volumes.some((v: any) => v.target === "/app/agent-home" && v.source === "agent-home-data");
        expect(hasAgentHome).toBe(true);
      }
    }
  });

  it("docker-compose.yml binds strictly to 127.0.0.1 loopback for port 3000", () => {
    const rawYaml = fs.readFileSync(composePath, "utf-8");
    expect(rawYaml).toContain('"127.0.0.1:3000:3000"');
    // Ensure public 0.0.0.0 is not exposed
    expect(rawYaml).not.toContain('"3000:3000"');
    expect(rawYaml).not.toContain('"0.0.0.0:3000:3000"');
  });

  it("docker-compose.yml enforces resource limits and anti-fork-bomb constraints", () => {
    const rawYaml = fs.readFileSync(composePath, "utf-8");
    expect(rawYaml).toMatch(/memory:\s*2048M/);
    expect(rawYaml).toMatch(/cpus:\s*"2\.0"/);
    expect(rawYaml).toMatch(/pids:\s*100/);

    const res = spawnSync("docker", ["compose", "config", "--format", "json"], {
      encoding: "utf-8",
    });
    if (res.status === 0 && res.stdout) {
      const jsonStart = res.stdout.indexOf("{");
      if (jsonStart !== -1) {
        const compose = JSON.parse(res.stdout.slice(jsonStart));
        const limits = compose.services.polymax.deploy?.resources?.limits;
        expect(limits).toBeDefined();
        expect(limits.pids).toBe(100);
      }
    }
  });

  it("strictly prohibits mounting host Docker socket (/var/run/docker.sock)", () => {
    const rawYaml = fs.readFileSync(composePath, "utf-8");
    expect(rawYaml).not.toContain("/var/run/docker.sock");
    expect(rawYaml).not.toContain("docker.sock");
  });

  it("Dockerfile pre-creates /app/agent-home, assigns bun:bun ownership, and sets AGENT_HOME_DIR", () => {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");

    expect(dockerfile).toContain("ENV AGENT_HOME_DIR=/app/agent-home");
    expect(dockerfile).toContain("/app/agent-home");
    expect(dockerfile).toContain("chown -R bun:bun /app");
    expect(dockerfile).toContain("USER bun");
  });
});

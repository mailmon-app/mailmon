#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-all}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="${MAILMON_LOAD_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
results_dir="${MAILMON_LOAD_RESULTS_DIR:-${root_dir}/load/results}"

mkdir -p "${results_dir}"

to_container_path() {
  local host_path="$1"

  case "${host_path}" in
    "${root_dir}"/*)
      echo "/work/${host_path#"${root_dir}/"}"
      ;;
    *)
      echo "${host_path}"
      ;;
  esac
}

run_k6() {
  local script_path="$1"
  local report_path="$2"

  if command -v k6 >/dev/null 2>&1; then
    MAILMON_LOAD_REPORT_PATH="${report_path}" k6 run "${script_path}"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "k6 is required for load smoke scenarios. Install k6 or Docker and retry." >&2
    exit 127
  fi

  local docker_network="${MAILMON_LOAD_DOCKER_NETWORK:-host}"
  local container_report_path
  container_report_path="$(to_container_path "${report_path}")"
  local -a docker_args=(
    run
    --rm
    --volume "${root_dir}:/work"
    --workdir /work
    --user "$(id -u):$(id -g)"
    --add-host host.docker.internal:host-gateway
    --env "MAILMON_LOAD_REPORT_PATH=${container_report_path}"
  )

  if [[ "${docker_network}" != "none" ]]; then
    docker_args+=(--network "${docker_network}")
  fi

  while IFS='=' read -r name _; do
    case "${name}" in
      MAILMON_LOAD_*)
        if [[ "${name}" != "MAILMON_LOAD_REPORT_PATH" ]]; then
          docker_args+=(--env "${name}")
        fi
        ;;
    esac
  done < <(env)

  docker "${docker_args[@]}" grafana/k6:latest run "$(to_container_path "${script_path}")"
}

run_sync() {
  run_k6 "${root_dir}/load/internal-sync.k6.js" "${results_dir}/internal-sync-${run_id}.json"
}

run_webhooks() {
  run_k6 \
    "${root_dir}/load/webhook-deliveries.k6.js" \
    "${results_dir}/webhook-deliveries-${run_id}.json"
}

case "${scenario}" in
  all)
    run_sync
    run_webhooks
    ;;
  sync)
    run_sync
    ;;
  webhooks | webhook-deliveries)
    run_webhooks
    ;;
  *)
    echo "Usage: scripts/run-load-smoke.sh [all|sync|webhooks]" >&2
    exit 2
    ;;
esac

echo "Load smoke JSON reports written under ${results_dir} with run id ${run_id}."

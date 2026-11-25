// 단위계: 태양 질량 = 1, 지구 궤도 반지름(1 AU) = 1, G = 1
//   → 지구 공전 속도 = 1, 1년 = 2π 시간 단위 (지구가 한 바퀴 돌면 1년)
// 화면에서 보기 좋게 행성 사이 거리와 천체 크기는 과장·압축했다.

export const DT = 0.002; // 정밀 계산 1스텝 (시간 단위)
export const STEPS_PER_YEAR = (2 * Math.PI) / DT; // ≈ 3142 스텝 = 1년
export const YEARS_PER_STEP = 1 / STEPS_PER_YEAR; // ≈ 2.8시간

export const SUN_R = 0.06;
export const WORLD_R = 2.8; // 입자가 이보다 멀어지면 소멸
export const VIEW_R = 2.65;

// 소행성대: 태양 둘레를 도는 케플러 원궤도 (시각 t의 위치를 식으로 바로 구한다)
export const BELT_IN = 1.75;
export const BELT_OUT = 2.5;
export const AST_R_MIN = 0.002; // 충돌 반지름 (과장)
export const AST_R_MAX = 0.008;

// 태양풍: 태양에서 바깥으로 거의 일정한 속도로 날아간다 (300~700 km/s)
//   속도 1(이 단위계) = 지구 공전 속도 ≈ 29.8 km/s
export const WIND_VMIN = 300 / 29.8;
export const WIND_VMAX = 700 / 29.8;
export const WIND_SPREAD = 0.15; // 동경 방향에서 벗어나는 최대 각 (rad)
export const EMIT_PER_STEP = 60; // 스텝당 방출하는 입자 수

// 해시 격자 칸 크기: 한 스텝 동안 입자가 움직이는 거리의 절반 + 소행성 반지름 + 소행성 이동 거리보다
// 크면, 입자 이동 구간 중점이 속한 칸과 주변 8칸만 봐도 충돌을 절대 놓치지 않는다.
const AST_MAX_STEP = Math.sqrt(1 / BELT_IN) * DT;
export const HASH_CELL = (WIND_VMAX * DT) / 2 + AST_R_MAX + AST_MAX_STEP + 0.002;

// ── 비트 플립 ──
// 지상에서 메모리 비트 하나가 1시간 동안 뒤집힐 확률 (소프트 에러율, 1,000 FIT/Mbit 수준)
export const SEU_PER_BIT_HOUR = 1e-12;
export const HOURS_PER_YEAR = 8766;

// 평상시 태양에서 스텝당 지구 피격 수 (실측값, tests/calibrate.mjs)
export const EARTH_HITS_PER_STEP = 0.668;

// N바이트 메모리에서 1년 동안 기대되는 비트 플립 수
export const flipsPerYear = (nBytes) => SEU_PER_BIT_HOUR * 8 * nBytes * HOURS_PER_YEAR;

// 지구 피격 1회가 메모리 비트 하나를 뒤집을 확률.
//   화면의 입자 하나는 실제 입자 수없이 많은 것을 대표하고, 대부분은 자기권·대기에 막히거나 메모리를 비껴간다.
//   "1년 동안의 피격 × p = 1년 동안의 기대 플립 수"가 되도록 맞춘다.
export const flipProbabilityPerHit = (nBytes) =>
  Math.min(1, flipsPerYear(nBytes) / (EARTH_HITS_PER_STEP * STEPS_PER_YEAR));

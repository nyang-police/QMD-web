# qmd-webgui

QMD를 웹 UI로 사용하기 위한 로컬 앱입니다.  
`Search`, `Collections`, `Status` 탭으로 구성되어 있으며, 백엔드(Express) + 프론트엔드(Vite/React) 구조입니다.

## 요구 사항

- Node.js 18+ (권장: 최신 LTS)
- `qmd` CLI 설치 및 기본 인덱스 준비
  - 예: `qmd status`, `qmd collection list`가 정상 동작해야 함

## 설치

프로젝트 루트에서:

```bash
npm install
npm install --prefix frontend
```

## 실행

```bash
npm run dev
```

- 기본 접속 주소: `http://localhost:5173`
- 백엔드 API: `http://localhost:8000`

## 사용 방법

### 1) Search 탭

- 검색어 입력 후 `Enter` 또는 `Search` 클릭
- 모드 선택:
  - `search (BM25)`: 키워드 검색
  - `vsearch (Vector)`: 벡터 검색
  - `query (Hybrid)`: 하이브리드 검색
- 컬렉션 필터, 최대 결과 수, 최소 점수(%) 설정 가능
- 결과 클릭 시 우측에서 `Preview`, `Snippet`, `Full Document`, `Metadata` 확인

### 2) Collections 탭

- 상단 버튼:
  - `+ Add`: 컬렉션 추가
  - `- Remove`: 선택 컬렉션 제거
  - `Rename`: 선택 컬렉션 이름 변경
  - `Refresh`: 목록 새로고침
- 좌측: 컬렉션 목록
- 우측: 선택 컬렉션 파일 목록
- 하단:
  - `Update Index`: 인덱스 업데이트
  - `Generate Embeddings`: 임베딩 생성
  - `Force re-embed`: 체크 시 전체 재임베딩

### 3) Status 탭

- `Refresh`로 QMD 상태 텍스트를 다시 불러옴
- 인덱스/컬렉션/모델/디바이스 정보 확인 가능

## 동작 방식 (중요)

- 검색/문서 조회는 MCP HTTP(JSON-RPC)를 우선 사용합니다.
- MCP가 불가한 경우, 주요 기능은 `qmd` CLI fallback으로 동작하도록 구성되어 있습니다.
- 컬렉션/상태 관련 정보는 CLI(`qmd collection list`, `qmd status`, `qmd ls`) 기반으로 안정적으로 조회합니다.

## 자주 발생하는 문제

### 1) `EADDRINUSE: address already in use :::8000`

이미 8000 포트를 점유한 백엔드가 실행 중입니다.

- 기존 프로세스를 종료하거나
- 그대로 두고 프론트만 실행해도 됩니다 (`dev` 스크립트가 중복 백엔드를 최대한 피하도록 구성됨).

### 2) Search에서 `Internal Server Error`가 뜰 때

- 최신 코드에서는 서버 에러 본문을 그대로 표시합니다.
- 먼저 `qmd` CLI 자체가 동작하는지 확인:

```bash
qmd status
qmd collection list
qmd search "test" -n 3 --json
```

- 위 명령이 실패하면 QMD 환경(모델/인덱스/권한)을 먼저 점검하세요.

### 3) Collections 탭이 비어 보일 때

- `qmd collection list` 결과가 실제로 비어 있는지 확인
- 백엔드가 최신 코드로 재시작되었는지 확인 (`npm run dev` 재실행)

## 개발 참고

- 백엔드 엔트리: `backend/server.js`
- 프론트엔드 엔트리: `frontend/src/App.jsx`
- 주요 컴포넌트:
  - `frontend/src/components/SearchTab.jsx`
  - `frontend/src/components/CollectionsTab.jsx`
  - `frontend/src/components/StatusTab.jsx`

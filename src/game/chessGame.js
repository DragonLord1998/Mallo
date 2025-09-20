const PieceType = {
  PAWN: 'pawn',
  KNIGHT: 'knight',
  BISHOP: 'bishop',
  ROOK: 'rook',
  QUEEN: 'queen',
  KING: 'king',
};

const PieceColor = {
  WHITE: 'white',
  BLACK: 'black',
};

const STARTING_BOARD = [
  'rnbqkbnr',
  'pppppppp',
  '........',
  '........',
  '........',
  '........',
  'PPPPPPPP',
  'RNBQKBNR',
];

const CHAR_TO_TYPE = {
  p: PieceType.PAWN,
  n: PieceType.KNIGHT,
  b: PieceType.BISHOP,
  r: PieceType.ROOK,
  q: PieceType.QUEEN,
  k: PieceType.KING,
};

const PIECE_TO_LETTER = {
  [PieceType.PAWN]: 'P',
  [PieceType.KNIGHT]: 'N',
  [PieceType.BISHOP]: 'B',
  [PieceType.ROOK]: 'R',
  [PieceType.QUEEN]: 'Q',
  [PieceType.KING]: 'K',
};

const FILES = 'abcdefgh';

function indexToCoord(index) {
  return { row: Math.floor(index / 8), col: index % 8 };
}

function coordToIndex(row, col) {
  return row * 8 + col;
}

function isOnBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function squareName(index) {
  const { row, col } = indexToCoord(index);
  return `${FILES[col]}${8 - row}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class ChessGame {
  constructor() {
    this.board = new Array(64).fill(null);
    this.currentPlayer = PieceColor.WHITE;
    this.moveHistory = [];
    this.nextPieceId = 1;
    this.lastMove = null;
    this.winner = null;
    this.enPassantTarget = null;
    this.reset();
  }

  reset() {
    this.board.fill(null);
    this.nextPieceId = 1;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const char = STARTING_BOARD[row][col];
        if (char === '.') continue;
        const lower = char.toLowerCase();
        const type = CHAR_TO_TYPE[lower];
        const color = char === lower ? PieceColor.BLACK : PieceColor.WHITE;
        this.board[coordToIndex(row, col)] = {
          type,
          color,
          hasMoved: false,
          id: this.nextPieceId,
        };
        this.nextPieceId += 1;
      }
    }
    this.currentPlayer = PieceColor.WHITE;
    this.moveHistory = [];
    this.lastMove = null;
    this.winner = null;
    this.enPassantTarget = null;
  }

  getPieceAt(index) {
    return this.board[index];
  }

  getPieces() {
    const pieces = [];
    for (let index = 0; index < 64; index += 1) {
      const piece = this.board[index];
      if (!piece) continue;
      const { row, col } = indexToCoord(index);
      pieces.push({ index, row, col, type: piece.type, color: piece.color, id: piece.id });
    }
    return pieces;
  }

  getState() {
    return {
      currentPlayer: this.currentPlayer,
      history: [...this.moveHistory],
      inCheck: this.isKingInCheck(this.currentPlayer) ? this.currentPlayer : null,
      winner: this.winner,
      lastMove: this.lastMove,
    };
  }

  getLegalMoves(index) {
    if (this.winner) return [];
    const piece = this.board[index];
    if (!piece || piece.color !== this.currentPlayer) {
      return [];
    }
    return this.generateLegalMoves(index, piece, piece.color);
  }

  move(fromIndex, toIndex) {
    if (this.winner) {
      return { success: false, message: 'Game over' };
    }
    const piece = this.board[fromIndex];
    if (!piece || piece.color !== this.currentPlayer) {
      return { success: false, message: 'Select a valid piece' };
    }
    const legalMoves = this.generateLegalMoves(fromIndex, piece, piece.color);
    const targetMove = legalMoves.find((move) => move.to === toIndex);
    if (!targetMove) {
      return { success: false, message: 'Illegal move' };
    }

    const originalType = piece.type;
    const fromCoord = indexToCoord(fromIndex);
    const toCoord = indexToCoord(toIndex);

    const moveState = this.applyMove(fromIndex, targetMove);
    const capturedPiece = moveState.captured ?? moveState.enPassantCaptured ?? null;

    this.updateEnPassantState({
      originalType,
      from: fromCoord,
      to: toCoord,
      color: piece.color,
      move: targetMove,
    });

    const opponent = piece.color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
    const opponentInCheck = this.isKingInCheck(opponent);
    const opponentHasMoves = this.hasAnyLegalMoves(opponent);

    let checkmate = false;
    let stalemate = false;
    if (!opponentHasMoves) {
      if (opponentInCheck) {
        checkmate = true;
        this.winner = piece.color;
      } else {
        stalemate = true;
        this.winner = 'draw';
      }
    }

    const historyEntry = this.createHistoryEntry({
      pieceType: originalType,
      color: piece.color,
      fromIndex,
      toIndex,
      captured: capturedPiece,
      promotion: targetMove.promotion,
      checkmate,
      check: opponentInCheck,
      stalemate,
      castle: targetMove.castle ? targetMove.castle.side : null,
      enPassant: Boolean(targetMove.enPassant),
    });
    this.moveHistory.push(historyEntry);
    this.lastMove = {
      from: fromIndex,
      to: toIndex,
      rook: targetMove.castle
        ? { from: targetMove.castle.rookFrom, to: targetMove.castle.rookTo }
        : null,
    };
    this.currentPlayer = opponent;

    return {
      success: true,
      captured: capturedPiece,
      check: opponentInCheck ? opponent : null,
      checkmate,
      stalemate,
      historyEntry,
      winner: this.winner,
      castle: targetMove.castle ?? null,
      enPassant: Boolean(targetMove.enPassant),
    };
  }

  hasAnyLegalMoves(color) {
    for (let index = 0; index < 64; index += 1) {
      const piece = this.board[index];
      if (!piece || piece.color !== color) continue;
      const moves = this.generateLegalMoves(index, piece, color);
      if (moves.length > 0) {
        return true;
      }
    }
    return false;
  }

  generateLegalMoves(index, piece, color) {
    const pseudoMoves = this.generatePseudoMoves(index, piece);
    const legal = [];
    for (const move of pseudoMoves) {
      if (!this.moveLeavesKingInCheck(color, index, move)) {
        legal.push(move);
      }
    }
    return legal;
  }

  moveLeavesKingInCheck(color, fromIndex, move) {
    const moveState = this.applyMove(fromIndex, move);
    const inCheck = this.isKingInCheck(color);
    this.undoMove(moveState);
    return inCheck;
  }

  applyMove(fromIndex, move) {
    const piece = this.board[fromIndex];
    if (!piece) {
      throw new Error('No piece to move');
    }

    const moveState = {
      piece,
      from: fromIndex,
      to: move.to,
      captured: null,
      enPassantCaptured: null,
      enPassantCaptureIndex: move.enPassant ? move.enPassantCapture : null,
      promotion: move.promotion ?? null,
      originalType: piece.type,
      originalHasMoved: piece.hasMoved,
      rookMove: null,
    };

    this.board[fromIndex] = null;

    if (move.castle) {
      const rook = this.board[move.castle.rookFrom];
      moveState.rookMove = {
        piece: rook ?? null,
        from: move.castle.rookFrom,
        to: move.castle.rookTo,
        originalHasMoved: rook ? rook.hasMoved : false,
      };
      if (rook) {
        this.board[move.castle.rookFrom] = null;
        this.board[move.castle.rookTo] = rook;
        rook.hasMoved = true;
      }
    }

    if (move.enPassant) {
      moveState.enPassantCaptured = this.board[move.enPassantCapture] ?? null;
      if (moveState.enPassantCaptureIndex !== null) {
        this.board[moveState.enPassantCaptureIndex] = null;
      }
    } else {
      moveState.captured = this.board[move.to] ?? null;
    }

    this.board[move.to] = piece;
    piece.hasMoved = true;
    if (move.promotion) {
      piece.type = move.promotion;
    }

    return moveState;
  }

  undoMove(moveState) {
    const { piece } = moveState;
    this.board[moveState.to] = moveState.captured;
    this.board[moveState.from] = piece;
    piece.hasMoved = moveState.originalHasMoved;
    if (moveState.promotion) {
      piece.type = moveState.originalType;
    }

    if (moveState.enPassantCaptured && moveState.enPassantCaptureIndex !== null) {
      this.board[moveState.enPassantCaptureIndex] = moveState.enPassantCaptured;
    }

    if (moveState.rookMove && moveState.rookMove.piece) {
      this.board[moveState.rookMove.to] = null;
      this.board[moveState.rookMove.from] = moveState.rookMove.piece;
      moveState.rookMove.piece.hasMoved = moveState.rookMove.originalHasMoved;
    }
  }

  updateEnPassantState({ originalType, from, to, color, move }) {
    this.enPassantTarget = null;
    if (originalType !== PieceType.PAWN) {
      return;
    }
    const rowDelta = to.row - from.row;
    if (Math.abs(rowDelta) !== 2 || move.enPassant) {
      return;
    }
    const midRow = (from.row + to.row) / 2;
    const targetIndex = coordToIndex(midRow, from.col);
    const captureColor = color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
    this.enPassantTarget = { index: targetIndex, captureColor };
  }

  generatePseudoMoves(index, piece) {
    const { row, col } = indexToCoord(index);
    const moves = [];

    switch (piece.type) {
      case PieceType.PAWN: {
        const direction = piece.color === PieceColor.WHITE ? -1 : 1;
        const startRow = piece.color === PieceColor.WHITE ? 6 : 1;
        const forwardRow = row + direction;
        if (isOnBoard(forwardRow, col) && !this.board[coordToIndex(forwardRow, col)]) {
          const promotion = forwardRow === 0 || forwardRow === 7 ? PieceType.QUEEN : null;
          moves.push({ from: index, to: coordToIndex(forwardRow, col), promotion });
          const twoRow = row + direction * 2;
          if (row === startRow && isOnBoard(twoRow, col) && !this.board[coordToIndex(twoRow, col)]) {
            moves.push({ from: index, to: coordToIndex(twoRow, col) });
          }
        }
        for (const offset of [-1, 1]) {
          const targetCol = col + offset;
          const targetRow = row + direction;
          if (!isOnBoard(targetRow, targetCol)) continue;
          const targetIndex = coordToIndex(targetRow, targetCol);
          const targetPiece = this.board[targetIndex];
          if (targetPiece && targetPiece.color !== piece.color) {
            const promotion = targetRow === 0 || targetRow === 7 ? PieceType.QUEEN : null;
            moves.push({
              from: index,
              to: targetIndex,
              promotion,
            });
            continue;
          }

          if (
            this.enPassantTarget &&
            this.enPassantTarget.captureColor === piece.color &&
            this.enPassantTarget.index === targetIndex
          ) {
            const captureIndex = coordToIndex(row, targetCol);
            const capturedPawn = this.board[captureIndex];
            if (
              capturedPawn &&
              capturedPawn.color !== piece.color &&
              capturedPawn.type === PieceType.PAWN
            ) {
              moves.push({
                from: index,
                to: targetIndex,
                enPassant: true,
                enPassantCapture: captureIndex,
              });
            }
          }
        }
        break;
      }
      case PieceType.KNIGHT: {
        const offsets = [
          [-2, -1],
          [-2, 1],
          [-1, -2],
          [-1, 2],
          [1, -2],
          [1, 2],
          [2, -1],
          [2, 1],
        ];
        for (const [dr, dc] of offsets) {
          const nr = row + dr;
          const nc = col + dc;
          if (!isOnBoard(nr, nc)) continue;
          const target = this.board[coordToIndex(nr, nc)];
          if (!target || target.color !== piece.color) {
            moves.push({ from: index, to: coordToIndex(nr, nc) });
          }
        }
        break;
      }
      case PieceType.BISHOP: {
        this.generateSlidingMoves(moves, index, piece, row, col, [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]);
        break;
      }
      case PieceType.ROOK: {
        this.generateSlidingMoves(moves, index, piece, row, col, [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]);
        break;
      }
      case PieceType.QUEEN: {
        this.generateSlidingMoves(moves, index, piece, row, col, [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]);
        break;
      }
      case PieceType.KING: {
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (!isOnBoard(nr, nc)) continue;
            const target = this.board[coordToIndex(nr, nc)];
            if (!target || target.color !== piece.color) {
              moves.push({ from: index, to: coordToIndex(nr, nc) });
            }
          }
        }
        this.generateCastlingMoves(moves, index, piece, row, col);
        break;
      }
      default:
        break;
    }

    return moves;
  }

  generateSlidingMoves(moves, index, piece, row, col, directions) {
    for (const [dr, dc] of directions) {
      let nr = row + dr;
      let nc = col + dc;
      while (isOnBoard(nr, nc)) {
        const targetIndex = coordToIndex(nr, nc);
        const targetPiece = this.board[targetIndex];
        if (!targetPiece) {
          moves.push({ from: index, to: targetIndex });
        } else {
          if (targetPiece.color !== piece.color) {
            moves.push({ from: index, to: targetIndex });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  generateCastlingMoves(moves, index, piece, row, col) {
    if (piece.hasMoved) {
      return;
    }
    const opponentColor = piece.color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
    if (this.isSquareAttacked(index, opponentColor)) {
      return;
    }

    const options = [
      {
        side: 'king',
        rookCol: 7,
        path: [col + 1, col + 2],
        kingPath: [col + 1, col + 2],
        finalCol: col + 2,
        rookTargetCol: col + 1,
      },
      {
        side: 'queen',
        rookCol: 0,
        path: [col - 1, col - 2, col - 3],
        kingPath: [col - 1, col - 2],
        finalCol: col - 2,
        rookTargetCol: col - 1,
      },
    ];

    for (const option of options) {
      if (option.finalCol < 0 || option.finalCol > 7) {
        continue;
      }

      const rookIndex = coordToIndex(row, option.rookCol);
      const rook = this.board[rookIndex];
      if (!rook || rook.type !== PieceType.ROOK || rook.color !== piece.color || rook.hasMoved) {
        continue;
      }

      let pathClear = true;
      for (const pathCol of option.path) {
        if (!isOnBoard(row, pathCol)) {
          pathClear = false;
          break;
        }
        const pathIndex = coordToIndex(row, pathCol);
        if (this.board[pathIndex]) {
          pathClear = false;
          break;
        }
      }
      if (!pathClear) {
        continue;
      }

      let safe = true;
      for (const kingCol of option.kingPath) {
        if (!isOnBoard(row, kingCol)) {
          safe = false;
          break;
        }
        const kingIndex = coordToIndex(row, kingCol);
        if (this.isSquareAttacked(kingIndex, opponentColor)) {
          safe = false;
          break;
        }
      }
      if (!safe) {
        continue;
      }

      moves.push({
        from: index,
        to: coordToIndex(row, option.finalCol),
        castle: {
          side: option.side,
          rookFrom: rookIndex,
          rookTo: coordToIndex(row, option.rookTargetCol),
        },
      });
    }
  }

  isKingInCheck(color) {
    const kingIndex = this.board.findIndex(
      (piece) => piece && piece.type === PieceType.KING && piece.color === color,
    );
    if (kingIndex === -1) {
      return false;
    }
    const attackerColor = color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
    return this.isSquareAttacked(kingIndex, attackerColor);
  }

  isSquareAttacked(index, attackerColor) {
    const { row, col } = indexToCoord(index);

    // Pawn attacks
    const pawnRow = row + (attackerColor === PieceColor.WHITE ? 1 : -1);
    for (const offset of [-1, 1]) {
      const pawnCol = col + offset;
      if (!isOnBoard(pawnRow, pawnCol)) continue;
      const piece = this.board[coordToIndex(pawnRow, pawnCol)];
      if (piece && piece.color === attackerColor && piece.type === PieceType.PAWN) {
        return true;
      }
    }

    // Knight attacks
    const knightOffsets = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, dc] of knightOffsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (!isOnBoard(nr, nc)) continue;
      const piece = this.board[coordToIndex(nr, nc)];
      if (piece && piece.color === attackerColor && piece.type === PieceType.KNIGHT) {
        return true;
      }
    }

    // Bishop / Queen (diagonals)
    const diagonalDirs = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [dr, dc] of diagonalDirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (isOnBoard(nr, nc)) {
        const piece = this.board[coordToIndex(nr, nc)];
        if (piece) {
          if (piece.color === attackerColor && (piece.type === PieceType.BISHOP || piece.type === PieceType.QUEEN)) {
            return true;
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    // Rook / Queen (orthogonal)
    const orthDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dr, dc] of orthDirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (isOnBoard(nr, nc)) {
        const piece = this.board[coordToIndex(nr, nc)];
        if (piece) {
          if (piece.color === attackerColor && (piece.type === PieceType.ROOK || piece.type === PieceType.QUEEN)) {
            return true;
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    // King adjacency
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (!isOnBoard(nr, nc)) continue;
        const piece = this.board[coordToIndex(nr, nc)];
        if (piece && piece.color === attackerColor && piece.type === PieceType.KING) {
          return true;
        }
      }
    }

    return false;
  }

  createHistoryEntry({
    pieceType,
    color,
    fromIndex,
    toIndex,
    captured,
    promotion,
    check,
    checkmate,
    stalemate,
    castle,
    enPassant,
  }) {
    const player = capitalize(color);
    if (castle) {
      const notation = castle === 'king' ? 'O-O' : 'O-O-O';
      let suffix = '';
      if (checkmate) {
        suffix = ' #';
      } else if (check) {
        suffix = ' +';
      } else if (stalemate) {
        suffix = ' =';
      }
      return `${player}: ${notation}${suffix}`;
    }
    const pieceLetter = PIECE_TO_LETTER[pieceType];
    const from = squareName(fromIndex);
    const to = squareName(toIndex);
    const action = captured ? 'x' : '→';
    const promotionSuffix = promotion ? `=${PIECE_TO_LETTER[promotion]}` : '';
    const enPassantSuffix = enPassant ? ' (e.p.)' : '';
    let suffix = '';
    if (checkmate) {
      suffix = ' #';
    } else if (check) {
      suffix = ' +';
    } else if (stalemate) {
      suffix = ' =';
    }
    return `${player}: ${pieceLetter}${from} ${action} ${to}${promotionSuffix}${enPassantSuffix}${suffix}`;
  }
}

export { PieceType, PieceColor };

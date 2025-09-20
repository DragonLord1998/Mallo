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

    const captured = this.board[toIndex];
    const originalType = piece.type;

    this.board[toIndex] = piece;
    this.board[fromIndex] = null;
    piece.hasMoved = true;
    if (targetMove.promotion) {
      piece.type = targetMove.promotion;
    }

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
      captured,
      promotion: targetMove.promotion,
      checkmate,
      check: opponentInCheck,
      stalemate,
    });
    this.moveHistory.push(historyEntry);
    this.lastMove = { from: fromIndex, to: toIndex };
    this.currentPlayer = opponent;

    return {
      success: true,
      captured,
      check: opponentInCheck ? opponent : null,
      checkmate,
      stalemate,
      historyEntry,
      winner: this.winner,
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
    const piece = this.board[fromIndex];
    const captured = this.board[move.to];
    const prevHasMoved = piece.hasMoved;
    const prevType = piece.type;

    this.board[move.to] = piece;
    this.board[fromIndex] = null;
    piece.hasMoved = true;
    if (move.promotion) {
      piece.type = move.promotion;
    }

    const inCheck = this.isKingInCheck(color);

    this.board[fromIndex] = piece;
    this.board[move.to] = captured;
    piece.hasMoved = prevHasMoved;
    piece.type = prevType;

    return inCheck;
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
          const targetPiece = this.board[coordToIndex(targetRow, targetCol)];
          if (targetPiece && targetPiece.color !== piece.color) {
            const promotion = targetRow === 0 || targetRow === 7 ? PieceType.QUEEN : null;
            moves.push({
              from: index,
              to: coordToIndex(targetRow, targetCol),
              promotion,
            });
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

  createHistoryEntry({ pieceType, color, fromIndex, toIndex, captured, promotion, check, checkmate, stalemate }) {
    const player = capitalize(color);
    const pieceLetter = PIECE_TO_LETTER[pieceType];
    const from = squareName(fromIndex);
    const to = squareName(toIndex);
    const action = captured ? 'x' : '→';
    const promotionSuffix = promotion ? `=${PIECE_TO_LETTER[promotion]}` : '';
    let suffix = '';
    if (checkmate) {
      suffix = ' #';
    } else if (check) {
      suffix = ' +';
    } else if (stalemate) {
      suffix = ' =';
    }
    return `${player}: ${pieceLetter}${from} ${action} ${to}${promotionSuffix}${suffix}`;
  }
}

export { PieceType, PieceColor };

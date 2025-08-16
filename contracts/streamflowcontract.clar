;; title: StreamFlow
;; version: 1.0.0
;; summary: Continuous BTC-denominated payment streaming settled in STX
;; description: Enable real-time salary/subscription streams with pausability, 
;;              cliff/vesting periods, and composable Stream NFTs

;; traits
(define-trait stream-nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)

;; token definitions
(define-non-fungible-token stream-nft uint)

;; constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_NOT_FOUND (err u101))
(define-constant ERR_INVALID_AMOUNT (err u102))
(define-constant ERR_INSUFFICIENT_BALANCE (err u103))
(define-constant ERR_STREAM_PAUSED (err u104))
(define-constant ERR_STREAM_ENDED (err u105))
(define-constant ERR_CLIFF_NOT_REACHED (err u106))
(define-constant ERR_ALREADY_CLAIMED (err u107))
(define-constant ERR_INVALID_PARAMS (err u108))
(define-constant ERR_TRANSFER_FAILED (err u109))
(define-constant ERR_ORACLE_ERROR (err u110))

(define-constant PRECISION u1000000) ;; 6 decimal places for rate calculations
(define-constant SECONDS_PER_BLOCK u600) ;; Average block time in seconds
(define-constant MAX_STREAM_DURATION u31536000) ;; 1 year in seconds

;; data vars
(define-data-var next-stream-id uint u1)
(define-data-var next-nft-id uint u1)
(define-data-var btc-stx-rate uint u50000000) ;; BTC price in microSTX (50 STX per BTC)
(define-data-var oracle-last-update uint u0)
(define-data-var contract-paused bool false)

;; data maps
(define-map streams 
  uint 
  {
    sender: principal,
    recipient: principal,
    btc-rate-per-second: uint, ;; BTC amount per second in satoshis
    start-time: uint,
    end-time: uint,
    cliff-time: uint,
    total-deposited: uint, ;; Total STX deposited
    total-claimed: uint,   ;; Total STX claimed
    paused: bool,
    pause-time: uint,
    total-paused-duration: uint,
    active: bool
  }
)

(define-map stream-nft-mapping uint uint) ;; NFT ID -> Stream ID
(define-map user-streams principal (list 100 uint))
(define-map recipient-streams principal (list 100 uint))
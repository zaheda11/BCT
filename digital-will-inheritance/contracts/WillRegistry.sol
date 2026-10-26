// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title WillRegistry
/// @notice Stores versioned integrity hashes and enforces verifier-gated inheritance execution.
contract WillRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    enum WillStatus { None, Active, Revoked }
    enum VerificationStatus { None, Pending, Approved, Rejected }
    struct Will { address testator; bytes32 documentHash; uint64 createdAt; uint32 version; WillStatus status; VerificationStatus verification; bool executed; bytes32 verificationRef; }
    mapping(bytes32 => Will) private wills;
    mapping(bytes32 => mapping(uint32 => bytes32)) private versionHashes;
    mapping(bytes32 => mapping(address => uint16)) private allocations;
    mapping(bytes32 => address[]) private beneficiaries;

    event WillCreated(bytes32 indexed willId, address indexed testator, bytes32 documentHash, uint32 version);
    event WillUpdated(bytes32 indexed willId, bytes32 documentHash, uint32 version);
    event WillRevoked(bytes32 indexed willId);
    event BeneficiarySet(bytes32 indexed willId, address indexed beneficiary, uint16 basisPoints);
    event VerificationSubmitted(bytes32 indexed willId, bytes32 indexed referenceHash);
    event VerificationDecided(bytes32 indexed willId, bool approved, bytes32 indexed referenceHash);
    event InheritanceExecuted(bytes32 indexed willId, address indexed verifier, uint64 timestamp);

    constructor(address admin, address verifier) {
        require(admin != address(0) && verifier != address(0), "zero role address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, verifier);
    }

    function createWill(bytes32 willId, bytes32 documentHash, address[] calldata recipients, uint16[] calldata shares) external {
        require(wills[willId].status == WillStatus.None, "will exists");
        require(willId != bytes32(0) && documentHash != bytes32(0), "empty identifier/hash");
        _validateShares(recipients, shares);
        Will storage w = wills[willId];
        w.testator = msg.sender; w.documentHash = documentHash; w.createdAt = uint64(block.timestamp); w.version = 1; w.status = WillStatus.Active;
        versionHashes[willId][1] = documentHash;
        _setBeneficiaries(willId, recipients, shares);
        emit WillCreated(willId, msg.sender, documentHash, 1);
    }

    function updateWill(bytes32 willId, bytes32 documentHash, address[] calldata recipients, uint16[] calldata shares) external {
        Will storage w = wills[willId];
        require(w.testator == msg.sender, "only testator"); require(w.status == WillStatus.Active && !w.executed, "will not editable");
        require(w.verification != VerificationStatus.Pending && w.verification != VerificationStatus.Approved, "verification in progress");
        require(documentHash != bytes32(0), "empty hash"); _validateShares(recipients, shares);
        w.documentHash = documentHash; w.version += 1; versionHashes[willId][w.version] = documentHash;
        _setBeneficiaries(willId, recipients, shares); emit WillUpdated(willId, documentHash, w.version);
    }

    function revokeWill(bytes32 willId) external {
        Will storage w = wills[willId]; require(w.testator == msg.sender, "only testator");
        require(w.status == WillStatus.Active && !w.executed, "will not revocable"); w.status = WillStatus.Revoked; emit WillRevoked(willId);
    }

    function submitVerification(bytes32 willId, bytes32 referenceHash) external onlyRole(VERIFIER_ROLE) {
        Will storage w = wills[willId]; require(w.status == WillStatus.Active && !w.executed, "will unavailable"); require(w.verification != VerificationStatus.Pending && w.verification != VerificationStatus.Approved, "verification already active"); require(referenceHash != bytes32(0), "empty reference");
        w.verification = VerificationStatus.Pending; w.verificationRef = referenceHash; emit VerificationSubmitted(willId, referenceHash);
    }

    function decideVerification(bytes32 willId, bool approved, bytes32 referenceHash) external onlyRole(VERIFIER_ROLE) {
        Will storage w = wills[willId]; require(w.verification == VerificationStatus.Pending, "no pending verification");
        require(referenceHash == w.verificationRef, "reference mismatch");
        w.verification = approved ? VerificationStatus.Approved : VerificationStatus.Rejected;
        emit VerificationDecided(willId, approved, referenceHash);
    }

    function executeInheritance(bytes32 willId) external onlyRole(VERIFIER_ROLE) {
        Will storage w = wills[willId]; require(w.status == WillStatus.Active, "will inactive"); require(w.verification == VerificationStatus.Approved, "verification not approved"); require(!w.executed, "already executed");
        w.executed = true; emit InheritanceExecuted(willId, msg.sender, uint64(block.timestamp));
    }

    function getWill(bytes32 willId) external view returns (Will memory) { require(wills[willId].status != WillStatus.None, "unknown will"); return wills[willId]; }
    function getWillVersion(bytes32 willId, uint32 version) external view returns (bytes32) { Will storage w = wills[willId]; require(w.status != WillStatus.None && version > 0 && version <= w.version, "unknown will version"); return versionHashes[willId][version]; }
    function getBeneficiaries(bytes32 willId) external view returns (address[] memory recipients, uint16[] memory shares) {
        require(wills[willId].status != WillStatus.None, "unknown will");
        recipients = beneficiaries[willId]; shares = new uint16[](recipients.length); for (uint256 i; i < recipients.length; ++i) shares[i] = allocations[willId][recipients[i]];
    }
    function _validateShares(address[] calldata recipients, uint16[] calldata shares) private pure {
        require(recipients.length > 0 && recipients.length == shares.length, "invalid beneficiary arrays"); uint256 total;
        for (uint256 i; i < recipients.length; ++i) { require(recipients[i] != address(0) && shares[i] > 0, "invalid beneficiary"); for (uint256 j; j < i; ++j) require(recipients[i] != recipients[j], "duplicate beneficiary"); total += shares[i]; }
        require(total == 10000, "allocations must equal 10000 bps");
    }
    function _setBeneficiaries(bytes32 willId, address[] calldata recipients, uint16[] calldata shares) private {
        address[] storage old = beneficiaries[willId]; for (uint256 i; i < old.length; ++i) delete allocations[willId][old[i]]; delete beneficiaries[willId];
        for (uint256 i; i < recipients.length; ++i) { beneficiaries[willId].push(recipients[i]); allocations[willId][recipients[i]] = shares[i]; emit BeneficiarySet(willId, recipients[i], shares[i]); }
    }
}

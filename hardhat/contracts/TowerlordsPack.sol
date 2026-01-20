// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface ITowerlordsCards {
    function mintCard(address to, string memory cardDefinitionId) external returns (uint256);
    function setMinter(address minter) external;
}

contract TowerlordsPack is ERC721Enumerable, Ownable {
    using Strings for uint256;

    uint256 private _nextPackId = 1;
    ITowerlordsCards public cards;
    address public opener;
    string[] private lootPool;
    uint256 public packSize = 3;

    event PackMinted(uint256 indexed packId, address indexed to);
    event PackOpened(uint256 indexed packId, address indexed owner, uint256[] cardTokenIds);

    constructor(address cards_, string[] memory lootPool_) ERC721("Towerlords Pack", "TLPACK") Ownable(msg.sender) {
        cards = ITowerlordsCards(cards_);
        opener = msg.sender;
        lootPool = lootPool_;
    }

    function setOpener(address opener_) external onlyOwner {
        opener = opener_;
    }

    function setPackSize(uint256 size) external onlyOwner {
        require(size > 0 && size <= 10, "invalid size");
        packSize = size;
    }

    function mintPack(address to) external onlyOwner returns (uint256) {
        uint256 id = _nextPackId++;
        _safeMint(to, id);
        emit PackMinted(id, to);
        return id;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(
            abi.encodePacked(
                "data:application/json;utf8:{\"name\":\"Pack #",
                tokenId.toString(),
                "\",\"description\":\"Unopened pack\"}"
            )
        );
    }

    function openPackFor(address owner, uint256 packId) external returns (uint256[] memory) {
        require(msg.sender == opener, "not opener");
        require(ownerOf(packId) == owner, "not owner");
        _burn(packId);
        uint256[] memory minted = new uint256[](packSize);
        uint256 randomness = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), packId, owner, totalSupply(), block.timestamp)));
        uint256 poolLen = lootPool.length;
        require(poolLen > 0, "empty pool");
        for (uint256 i = 0; i < packSize; i++) {
            uint256 idx = randomness % poolLen;
            randomness = uint256(keccak256(abi.encodePacked(randomness, i)));
            minted[i] = cards.mintCard(owner, lootPool[idx]);
        }
        emit PackOpened(packId, owner, minted);
        return minted;
    }
}

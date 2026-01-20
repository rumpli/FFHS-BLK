// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract TowerlordsCards is ERC721Enumerable, Ownable {
    using Strings for uint256;
    address public minter;
    uint256 private _nextTokenId = 1;
    mapping(uint256 => string) private _cardDefinitionIds;
    string private _baseTokenURI;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) Ownable(msg.sender) {}

    function setBaseURI(string memory baseUri) external onlyOwner {
        _baseTokenURI = baseUri;
    }

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
    }

    function mintCard(address to, string memory cardDefinitionId) external returns (uint256) {
        require(msg.sender == owner() || msg.sender == minter, "not minter");
        uint256 tokenId = _nextTokenId++;
        _cardDefinitionIds[tokenId] = cardDefinitionId;
        _safeMint(to, tokenId);
        return tokenId;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        // If base URI is set, default ERC721 logic concatenates tokenId; otherwise inline JSON with cardDefinitionId
        string memory baseUri = _baseURI();
        if (bytes(baseUri).length > 0) {
            return string(abi.encodePacked(baseUri, tokenId.toString()));
        }
        string memory cardId = _cardDefinitionIds[tokenId];
        return string(
            abi.encodePacked(
                "data:application/json;utf8:{\"name\":\"Towerlords Card #",
                tokenId.toString(),
                "\",\"description\":\"Towerlords card\",\"cardDefinitionId\":\"",
                cardId,
                "\"}"
            )
        );
    }

    function cardDefinitionIdOf(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _cardDefinitionIds[tokenId];
    }
}

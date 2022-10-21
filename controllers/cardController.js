"use strict";

const pokemon = require("pokemontcgsdk");
pokemon.configure({ apikey: process.env.POKE_API_KEY });

const Card = require("../models/card");
const User = require("../models/user");
const getRarityRating = require("../helpers/getRarityRating");

// Handle display all cards on GET
exports.display_collection_get = (req, res, next) => {
  User.findById(req.user._id)
    .populate("cards")
    .exec(function (err, user) {
      res.render("home", {
        title: "My Collection",
        card_list: user.cards.sort((a, b) => b.value.market - a.value.market)
      });
    });
};

// Handle display card detail on GET
exports.display_card_get = (req, res, next) => {
  const cardId = req.params.id;

  Card.findById(cardId).exec((err, result) => {
    if (err) return next(err);

    if (result === null) {
      const err = new Error("Collection card not found");
      err.status = 404;
      return next(err);
    }
    // Successful, so render
    res.render("card-detail", {
      title: `Collection: ${result.pokemon.name}`,
      card: result
    });
  });
};

// ################# Update/Delete Cards ##################

// Handle edit card detail on POST
exports.edit_card_post = (req, res, next) => {
  const cardId = req.params.id;
  const pokemonId = req.body.cardId;

  Card.findById(cardId).exec((err, result) => {
    if (err) return next(err);
    const card = result;

    if (!card) {
      const err = new Error("Card not found");
      err.status = 404;
      return next(err);
    }

    if (req.body.reverseHolo) {
      pokemon.card.find(pokemonId).then((tcgCard) => {
        const marketValue = tcgCard.tcgplayer.prices.reverseHolofoil.market;

        card.meta.rarity.reverseHolo = true;
        card.value.market = marketValue;
        card.value.priceType = "reverseHolofoil";
        card.value.priceHistory = [
          [new Date().toLocaleDateString("en-US"), marketValue]
        ];
        card.value.count = req.body.count;

        card.save((err) => {
          if (err) return next(err);

          res.redirect(`/collection/${card._id}`);
        });
      });
    } else {
      card.value.count = req.body.count;

      card.save((err) => {
        if (err) return next(err);

        res.redirect(`/collection/${card._id}`);
      });
    }
  });
};

exports.update_price_history_post = (req, res, next) => {
  const cardId = req.params.id;
  const pokemonId = req.body.cardId;

  Card.findById(cardId).exec((err, result) => {
    if (err) return next(err);
    const card = result;

    if (!card) {
      const err = new Error("Card not found");
      err.status = 404;
      return next(err);
    }

    pokemon.card.find(pokemonId).then((tcgCard) => {
      const newDate = new Date().toLocaleDateString("en-US");

      const marketValue = tcgCard.tcgplayer.prices[card.value.priceType].market;

      card.value.market = marketValue;

      if (card.value.priceHistory[0][0] === newDate) {
        card.value.priceHistory[0][1] === marketValue;
      } else {
        card.value.priceHistory.unshift([
          new Date().toLocaleDateString("en-US"),
          marketValue
        ]);
      }

      card.save((err) => {
        if (err) return next(err);

        res.redirect(`/collection/${card._id}`);
      });
    });
  });
};

exports.delete_card_get = (req, res, next) => {
  Card.findById(req.params.id).exec((err, result) => {
    if (err) return next(err);
    const card = result;

    if (!card) {
      const err = new Error("Card not found");
      err.status = 404;
      return next(err);
    }

    res.render("card-delete", {
      title: `Delete ${card.pokemon.name}`,
      cardId: card._id,
      cardName: card.pokemon.name
    });
  });
};

exports.delete_card_post = (req, res, next) => {
  const userId = req.user._id;
  const cardId = req.body.cardId;

  User.findById(userId, (err, result) => {
    if (err) return next(err);
    const user = result;
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      return next(err);
    }

    const newCollection = user.cards.filter((card) => String(card) !== cardId);
    const newBulk = user.bulk.length
      ? user.bulk.filter((card) => String(card) !== cardId)
      : [];

    user.cards = newCollection;
    user.bulk = newBulk;

    user.save((err) => {
      if (err) return next(err);

      Card.findByIdAndRemove(cardId, (err) => {
        if (err) return next(err);

        res.redirect("/collection/home");
      });
    });
  });
};

// ################## Add Cards ###################
exports.add_card_post = (req, res, next) => {
  const cardId = req.body.cardId;

  pokemon.card.find(cardId).then((card) => {
    let marketValue;
    let priceType;

    if (!card.tcgplayer) {
      marketValue = 0;
      priceType = null;
    } else if (card.tcgplayer.prices.holofoil) {
      marketValue =
        card.tcgplayer.prices.holofoil.market ||
        card.tcgplayer.prices.holofoil.mid;
      priceType = "holofoil";
    } else if (card.tcgplayer.prices.normal) {
      marketValue = card.tcgplayer.prices.normal.market;
      priceType = "normal";
    } else if (card.tcgplayer.prices.unlimited) {
      marketValue = card.tcgplayer.prices.unlimited.market;
      priceType = "unlimited";
    } else if (card.tcgplayer.prices.unlimitedHolofoil) {
      marketValue = card.tcgplayer.prices.unlimitedHolofoil.market;
      priceType = "unlimitedHolofoil";
    } else if (card.tcgplayer.prices["1stEditionHolofoil"]) {
      marketValue = card.tcgplayer.prices["1stEditionHolofoil"].market;
      priceType = "1stEditionHolofoil";
    } else if (card.tcgplayer.prices["1stEdition"]) {
      marketValue = card.tcgplayer.prices["1stEdition"].market;
      priceType = "1stEdition";
    } else if (card.tcgplayer.prices.reverseHolofoil) {
      marketValue = card.tcgplayer.prices.reverseHolofoil.market;
      priceType = "reverseHolofoil";
    } else {
      marketValue = 0;
      priceType = null;
    }

    const newCard = new Card({
      id: card.id,

      meta: {
        images: {
          small: card.images.small,
          large: card.images.large
        },
        rarity: {
          type: card.rarity,
          grade: getRarityRating[card.rarity]
        },
        supertype: card.supertype,
        subtypes: card.subtypes,
        set: {
          symbol: card.set.images.symbol,
          logo: card.set.images.logo,
          name: card.set.name,
          id: card.set.id,
          series: card.set.series,
          number: card.number,
          totalPrint: card.set.printedTotal,
          releaseDate: card.set.releaseDate
        }
      },

      pokemon: {
        name: card.name,
        natDex: card.nationalPokedexNumbers[0]
      },

      value: {
        market: marketValue,
        priceHistory: [
          [new Date().toLocaleDateString("en-US"), marketValue.toFixed(2)]
        ],
        priceType: priceType,
        count: 1
      }
    });

    newCard.save((err) => {
      if (err) return next(err);

      User.findByIdAndUpdate(
        req.user._id,
        { $push: { cards: newCard._id } },
        (err) => {
          if (err) return next(err);

          res.redirect("/collection/home");
        }
      );
    });
  });
};

exports.add_bulk_post = (req, res, next) => {
  Card.findOne({ id: req.body.cardId }, function (err, result) {
    if (err) return next(err);
    const card_id = result._id;
    const card = result;
    console.log("CARD", card);
    console.log("CARDID", card.id);
    console.log("CARD-ID", card_id);
    console.log("CARD._ID", card._id);

    if (!card) {
      const err = new Error("Card not found");
      err.status = 404;
      return next(err);
    }

    User.findById(req.user._id, (err, result) => {
      if (err) return next(err);
      const user = result;
      if (!user) {
        const err = new Error("User not found");
        err.status = 404;
        return next(err);
      }
      user.bulk.push(card_id);

      user.save((err) => {
        if (err) return next(err);

        res.redirect("/collection/home");
      });
    });
  });
};

// ################# Sort Cards ###################

// ################ Filter Cards ##################
// Handle display cards by set on GET
exports.display_filter_by_set_get = (req, res, next) => {
  // Finf User
  User.findById(req.user._id)
    .populate("cards")
    .exec((err, result) => {
      if (err) return next(err);
      const user = result;

      if (!user) {
        const err = new Error("User not found");
        err.status = 404;
        return next(err);
      }

      // Find which sets exist in collection
      let setOrderLength = 0;
      const setOrder = {};
      user.cards.forEach((card) => {
        const setName = card.meta.set.name;

        if (!(setName in setOrder)) {
          setOrder[setName] = true;
          setOrderLength++;
        }
      });

      pokemon.set
        .all()
        .then((sets) => {
          let n = -1;

          // Search through all sets and get the order of collection sets
          sets.forEach((set) => {
            if (set.name in setOrder) {
              setOrder[set.name] = n;
              n++;
            }
          });

          console.log("SET ORDER:", setOrder);

          // Organize the cards into the sets by date
          const orderedSets = new Array(setOrderLength);
          user.cards.forEach((card) => {
            const setName = card.meta.set.name;
            if (!orderedSets[setOrder[setName]]) {
              orderedSets[setOrder[setName]] = [];
            }
            orderedSets[setOrder[setName]].push(card);
          });

          // console.log(orderedSets);

          res.render("sets-collection", {
            title: "Set Collection",
            list_sets: orderedSets
          });
        })
        .catch((err) => {
          return next(err);
        });
    });
};

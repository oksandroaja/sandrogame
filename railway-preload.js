"use strict";

const Module = require("module");
const originalLoad = Module._load;

Module._load = function(request, parent, isMain) {
    if (request === "helmet") {
        const originalHelmet = originalLoad.call(
            this,
            request,
            parent,
            isMain
        );

        return function railwayHelmet(options = {}) {
            return originalHelmet({
                ...options,
                contentSecurityPolicy: false
            });
        };
    }

    return originalLoad.call(this, request, parent, isMain);
};
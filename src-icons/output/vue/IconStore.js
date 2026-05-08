import { defineComponent, h } from 'vue';

export const IconStore = defineComponent({
  name: 'IconStore',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M192 448v384h640V448", "fillRule": "evenodd"}),
        h('path', {"d": "M128 448l64-256h640l64 256", "fillRule": "evenodd"}),
        h('path', {"d": "M128 448c0 64 48 112 112 112s112-48 112-112", "fillRule": "evenodd"}),
        h('path', {"d": "M352 448c0 64 48 112 112 112s112-48 112-112", "fillRule": "evenodd"}),
        h('path', {"d": "M576 448c0 64 48 112 112 112s112-48 112-112", "fillRule": "evenodd"}),
        h('path', {"d": "M800 448c0 64 48 112 112 112", "fillRule": "evenodd"}),
        h('path', {"d": "M128 448c0 64-48 112-16 112", "fillRule": "evenodd"})
      ]
    );
  }
});

import { defineComponent, h } from 'vue';

export const IconBox = defineComponent({
  name: 'IconBox',
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
        h('path', {"d": "M512 96L128 288v448l384 192 384-192V288L512 96z", "fillRule": "evenodd"}),
        h('path', {"d": "M128 288l384 192 384-192", "fillRule": "evenodd"})
      ]
    );
  }
});
